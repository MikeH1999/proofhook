import { randomUUID, timingSafeEqual } from 'node:crypto'
import { resolve } from 'node:path'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import { getAddress, isAddress, type Address, type Hex } from 'viem'
import { z } from 'zod'
import { loadConfig } from './config.js'
import type { ProofhookEvent } from './domain/types.js'
import { checkReceipt } from './filecoin/checker.js'
import { createCalibrationPublicClient } from './filecoin/client.js'
import { parseReceipt, readReceipt } from './filecoin/receipt.js'
import { getWalletStorage } from './filecoin/wallet-data.js'
import { deliverWebhookWithRetry } from './webhooks/delivery.js'
import { buildHealthEvent } from './webhooks/events.js'
import { verifyWebhookSignature } from './webhooks/signature.js'
import { assertSafeWebhookUrl } from './webhooks/url-safety.js'
import { DeliveryStore } from './storage/delivery-store.js'
import { verifyMonitorAuthorization } from './monitoring/authorization.js'
import { MonitorStore } from './monitoring/store.js'
import { publicMonitor, type MonitorPieceResult, type MonitorRun, type WalletMonitor } from './monitoring/types.js'

const config = loadConfig()
const publicClient = createCalibrationPublicClient()
const app = Fastify({ logger: true, bodyLimit: 256 * 1024, trustProxy: true })
const deliveryStore = new DeliveryStore(config.deliveryLogPath)
await deliveryStore.initialize()
const monitorStore = new MonitorStore(config.monitorStatePath)
await monitorStore.initialize()
const runningMonitors = new Set<string>()

await app.register(fastifyRateLimit, {
  global: false,
  keyGenerator: (request) => request.ip,
  errorResponseBuilder: (_request, context) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: `Rate limit exceeded. Retry in ${context.after}.`,
  }),
})

await app.register(fastifyStatic, {
  root: resolve('public'),
  prefix: '/',
})

app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
  done(null, body)
})

const inbox: Array<{
  receivedAt: string
  signatureVerified: boolean
  event: unknown
}> = []

function parseJsonBody(body: unknown): unknown {
  if (typeof body !== 'string') throw new Error('Expected a JSON request body')
  return JSON.parse(body)
}

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

function requestReceiverUrl(request: {
  headers: Record<string, unknown>
  protocol: string
}): string {
  if (config.demoWebhookUrl) return config.demoWebhookUrl
  const forwardedProtocol = headerValue(
    request.headers['x-forwarded-proto'] as string | string[] | undefined
  )
    .split(',')[0]
    ?.trim()
  const protocol = forwardedProtocol === 'https' || forwardedProtocol === 'http'
    ? forwardedProtocol
    : request.protocol
  const host = headerValue(request.headers.host as string | string[] | undefined)
  if (!host) throw new Error('Cannot derive the demo receiver URL without a Host header')
  return new URL('/demo/receiver', `${protocol}://${host}`).toString()
}

function assertAdminAccess(request: { headers: Record<string, unknown> }): void {
  if (!config.adminKey) return
  const supplied = headerValue(request.headers['x-proofhook-api-key'] as string | string[] | undefined)
  const expectedBytes = Buffer.from(config.adminKey)
  const suppliedBytes = Buffer.from(supplied)
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    throw new Error('Invalid or missing Proofhook API key')
  }
}

const publicReadLimit = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }
const walletReadLimit = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }
const webhookWriteLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }
const healthCheckLimit = { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }
const monitorWriteLimit = { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }

app.get('/api/health', async () => ({
  ok: true,
  receiptPath: config.receiptPath,
  schedulerEnabled: config.scheduleSeconds > 0,
  scheduleSeconds: config.scheduleSeconds,
  walletSchedulerEnabled: true,
  time: new Date().toISOString(),
}))

app.get('/api/demo-receipt', publicReadLimit, async (_request, reply) => {
  try {
    return await readReceipt(config.receiptPath)
  } catch (error) {
    return reply.code(404).send({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/demo/receiver', webhookWriteLimit, async (request, reply) => {
  const rawBody = typeof request.body === 'string' ? request.body : ''
  const timestamp = headerValue(request.headers['x-proofhook-timestamp'])
  const signature = headerValue(request.headers['x-proofhook-signature'])
  const signatureVerified = verifyWebhookSignature(rawBody, timestamp, signature, config.webhookSecret)

  let event: unknown
  try {
    event = JSON.parse(rawBody)
  } catch {
    return reply.code(400).send({ ok: false, error: 'Invalid JSON' })
  }

  inbox.unshift({ receivedAt: new Date().toISOString(), signatureVerified, event })
  if (inbox.length > 50) inbox.length = 50

  if (!signatureVerified) return reply.code(401).send({ ok: false, error: 'Invalid signature' })
  return reply.code(202).send({ ok: true, accepted: headerValue(request.headers['x-proofhook-event-id']) })
})

const walletAddressSchema = z
  .string()
  .refine(isAddress, 'Expected a valid EVM wallet address')
  .transform((address) => getAddress(address))

app.get('/demo/inbox', publicReadLimit, async (request, reply) => {
  try {
    const query = z.object({ walletAddress: walletAddressSchema.optional() }).parse(request.query)
    const walletAddress = query.walletAddress?.toLowerCase()
    if (!walletAddress) assertAdminAccess(request)
    return {
      events: walletAddress
        ? inbox.filter((entry) => {
            const event = entry.event as { data?: { walletAddress?: string } }
            return event.data?.walletAddress?.toLowerCase() === walletAddress
          })
        : inbox,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return reply.code(message.includes('API key') ? 401 : 400).send({ error: message })
  }
})

app.get('/api/deliveries', publicReadLimit, async (request, reply) => {
  try {
    const query = z.object({ walletAddress: walletAddressSchema.optional() }).parse(request.query)
    if (!query.walletAddress) assertAdminAccess(request)
    return { deliveries: deliveryStore.list(50, query.walletAddress) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return reply.code(message.includes('API key') ? 401 : 400).send({ error: message })
  }
})

app.get('/api/wallet/:address/datasets', walletReadLimit, async (request, reply) => {
  try {
    const params = z.object({ address: walletAddressSchema }).parse(request.params)
    const storage = await getWalletStorage(publicClient, params.address)
    return { address: storage.address, dataSets: storage.dataSets }
  } catch (error) {
    request.log.error(error)
    return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/wallet/:address/pieces', walletReadLimit, async (request, reply) => {
  try {
    const params = z.object({ address: walletAddressSchema }).parse(request.params)
    return await getWalletStorage(publicClient, params.address)
  } catch (error) {
    request.log.error(error)
    return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/wallet/:address/monitor', walletReadLimit, async (request, reply) => {
  try {
    const params = z.object({ address: walletAddressSchema }).parse(request.params)
    return {
      monitor: publicMonitor(monitorStore.get(params.address)),
      runs: monitorStore.listRuns(params.address, 20),
    }
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/wallet/monitor', monitorWriteLimit, async (request, reply) => {
  const bodySchema = z.object({
    walletAddress: walletAddressSchema,
    intervalHours: z.number().int().min(1).max(168).default(3),
    enabled: z.boolean().default(true),
    runNow: z.boolean().default(true),
    issuedAt: z.string().datetime(),
    signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
  })
  try {
    const body = bodySchema.parse(parseJsonBody(request.body))
    await verifyMonitorAuthorization({
      walletAddress: body.walletAddress as Address,
      intervalHours: body.intervalHours,
      enabled: body.enabled,
      runNow: body.runNow,
      issuedAt: body.issuedAt,
      signature: body.signature as Hex,
    })
    const targetUrl = config.demoWebhookUrl ?? (config.publicUrl
      ? new URL('/demo/receiver', config.publicUrl).toString()
      : requestReceiverUrl(request))
    const webhookUrl = (await assertSafeWebhookUrl(
      targetUrl,
      config.allowPrivateWebhookUrls
    )).toString()
    const monitor = await monitorStore.upsert({
      walletAddress: body.walletAddress,
      intervalHours: body.intervalHours,
      enabled: body.enabled,
      runNow: body.runNow,
      webhookUrl,
      authorization: body.signature,
    })
    const run = body.enabled && body.runNow ? await runScheduledMonitor(monitor) : null
    return {
      monitor: publicMonitor(monitorStore.get(body.walletAddress)),
      run,
    }
  } catch (error) {
    request.log.error(error)
    return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/test-webhook', webhookWriteLimit, async (request, reply) => {
  try {
    const bodySchema = z.object({
      webhookUrl: z.string().url().optional(),
      walletAddress: walletAddressSchema.optional(),
    })
    const body = bodySchema.parse(parseJsonBody(request.body))
    if (body.webhookUrl) assertAdminAccess(request)
    const event: ProofhookEvent = {
      id: `evt_${randomUUID()}`,
      type: 'webhook.test',
      createdAt: new Date().toISOString(),
      subscriptionId: 'demo-subscription',
      chain: 'calibration',
      data: {
        message: 'Proofhook test event. This is not a Filecoin health event.',
        ...(body.walletAddress ? { walletAddress: body.walletAddress } : {}),
      },
    }
    const webhookUrl = (await assertSafeWebhookUrl(
      body.webhookUrl ?? requestReceiverUrl(request),
      config.allowPrivateWebhookUrls
    )).toString()
    const delivery = await deliverWebhookWithRetry(
      webhookUrl,
      event,
      config.webhookSecret
    )
    await deliveryStore.append({
      id: event.id,
      createdAt: new Date().toISOString(),
      event,
      result: delivery,
      webhookUrl,
    })
    return reply.code(delivery.ok ? 200 : 502).send({ event, delivery })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return reply.code(message.includes('API key') ? 401 : 400).send({ error: message })
  }
})

async function runHealthCheck(
  receipt: Awaited<ReturnType<typeof readReceipt>>,
  rawWebhookUrl: string,
  subscriptionId: string,
  walletAddress?: string
) {
  const checkedHealth = await checkReceipt(publicClient, receipt)
  const health = walletAddress ? { ...checkedHealth, walletAddress } : checkedHealth
  const event = buildHealthEvent(health, subscriptionId)
  const webhookUrl = (await assertSafeWebhookUrl(
    rawWebhookUrl,
    config.allowPrivateWebhookUrls
  )).toString()
  const delivery = await deliverWebhookWithRetry(webhookUrl, event, config.webhookSecret)
  await deliveryStore.append({
    id: event.id,
    createdAt: new Date().toISOString(),
    event,
    result: delivery,
    webhookUrl,
  })
  return { health, event, delivery }
}

type WalletPiece = Awaited<ReturnType<typeof getWalletStorage>>['pieces'][number]

function receiptFromWalletPiece(piece: WalletPiece) {
  return parseReceipt({
    chain: 'calibration',
    pieceCid: piece.pieceCid,
    size: 1,
    createdAt: new Date().toISOString(),
    transactionHashes: [],
    copies: piece.copies.map((copy, index) => ({
      providerId: copy.providerId,
      dataSetId: copy.dataSetId,
      pieceId: copy.pieceId,
      retrievalUrl: copy.retrievalUrl,
      role: index === 0 ? 'primary' : 'secondary',
    })),
  })
}

function aggregateRunState(results: MonitorPieceResult[]): MonitorRun['state'] {
  if (results.length === 0) return 'unknown'
  if (results.some((result) => result.state === 'unhealthy')) return 'unhealthy'
  if (results.some((result) => result.state === 'degraded')) return 'degraded'
  if (results.some((result) => result.state === 'unknown')) return 'unknown'
  return 'healthy'
}

async function runScheduledMonitor(monitor: WalletMonitor): Promise<MonitorRun | null> {
  const key = monitor.walletAddress.toLowerCase()
  if (runningMonitors.has(key)) return null
  runningMonitors.add(key)
  const startedAt = new Date()
  const runId = `run_${randomUUID()}`
  const results: MonitorPieceResult[] = []
  let runError: string | null = null

  try {
    const storage = await getWalletStorage(publicClient, monitor.walletAddress as Address)
    const checked = await Promise.all(storage.pieces.map(async (piece): Promise<MonitorPieceResult> => {
      try {
        const result = await runHealthCheck(
          receiptFromWalletPiece(piece),
          monitor.webhookUrl,
          `scheduled:${runId}`,
          monitor.walletAddress
        )
        return {
          pieceCid: piece.pieceCid,
          state: result.health.state,
          copyCount: result.health.copies.length,
          healthyCopyCount: result.health.copies.filter(
            (copy) => copy.retrievalVerified && copy.proofOverdue === false
          ).length,
          eventId: result.event.id,
          delivery: result.delivery,
          health: result.health,
          error: null,
        }
      } catch (error) {
        return {
          pieceCid: piece.pieceCid,
          state: 'unknown',
          copyCount: piece.copies.length,
          healthyCopyCount: 0,
          eventId: null,
          delivery: null,
          health: null,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }))
    results.push(...checked)
  } catch (error) {
    runError = error instanceof Error ? error.message : String(error)
  }

  const completedAt = new Date()
  const run: MonitorRun = {
    id: runId,
    walletAddress: monitor.walletAddress,
    intervalHours: monitor.intervalHours,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    state: aggregateRunState(results),
    pieceCount: results.length,
    copyCount: results.reduce((sum, result) => sum + result.copyCount, 0),
    healthyCopyCount: results.reduce((sum, result) => sum + result.healthyCopyCount, 0),
    webhooksDelivered: results.filter((result) => result.delivery?.ok).length,
    webhooksTotal: results.filter((result) => result.delivery !== null).length,
    results,
    error: runError,
  }
  try {
    await monitorStore.completeRun(run)
    app.log.info(
      { runId, walletAddress: monitor.walletAddress, state: run.state, pieces: run.pieceCount },
      'Scheduled wallet health run completed'
    )
    return run
  } finally {
    runningMonitors.delete(key)
  }
}

async function runDueWalletMonitors(): Promise<void> {
  for (const monitor of monitorStore.due()) {
    try {
      await runScheduledMonitor(monitor)
    } catch (error) {
      app.log.error(error, 'Scheduled wallet health run failed')
    }
  }
}


async function runDemoHealthCheck(rawWebhookUrl: string) {
  const receipt = await readReceipt(config.receiptPath)
  return runHealthCheck(receipt, rawWebhookUrl, 'demo-subscription')
}

app.post('/api/check', healthCheckLimit, async (request, reply) => {
  const bodySchema = z.object({
    subscriptionId: z.string().min(1).max(100),
    webhookUrl: z.string().url(),
    receipt: z.unknown(),
  })

  try {
    assertAdminAccess(request)
    const body = bodySchema.parse(parseJsonBody(request.body))
    const result = await runHealthCheck(
      parseReceipt(body.receipt),
      body.webhookUrl,
      body.subscriptionId
    )
    return reply.code(result.delivery.ok ? 200 : 502).send(result)
  } catch (error) {
    request.log.error(error)
    const message = error instanceof Error ? error.message : String(error)
    return reply.code(message.includes('API key') ? 401 : 400).send({ error: message })
  }
})

app.post('/api/wallet/check', healthCheckLimit, async (request, reply) => {
  const bodySchema = z.object({
    walletAddress: walletAddressSchema,
    pieceCid: z.string().min(1).max(200),
    webhookUrl: z.string().url().optional(),
  })

  try {
    const body = bodySchema.parse(parseJsonBody(request.body))
    if (body.webhookUrl) assertAdminAccess(request)
    const storage = await getWalletStorage(publicClient, body.walletAddress)
    const selectedPiece = storage.pieces.find((piece) => piece.pieceCid === body.pieceCid)
    if (!selectedPiece) {
      throw new Error('The selected PieceCID does not belong to the connected wallet')
    }

    const receipt = receiptFromWalletPiece(selectedPiece)
    const result = await runHealthCheck(
      receipt,
      body.webhookUrl ?? requestReceiverUrl(request),
      `wallet:${body.walletAddress.toLowerCase()}`,
      body.walletAddress
    )
    return reply.code(result.delivery.ok ? 200 : 502).send(result)
  } catch (error) {
    request.log.error(error)
    const message = error instanceof Error ? error.message : String(error)
    return reply.code(message.includes('API key') ? 401 : 400).send({ error: message })
  }
})

app.post('/api/check-demo', healthCheckLimit, async (request, reply) => {
  const bodySchema = z.object({ webhookUrl: z.string().url().optional() })
  const body = bodySchema.parse(parseJsonBody(request.body))

  try {
    if (body.webhookUrl) assertAdminAccess(request)
    const result = await runDemoHealthCheck(body.webhookUrl ?? requestReceiverUrl(request))
    return reply.code(result.delivery.ok ? 200 : 502).send(result)
  } catch (error) {
    request.log.error(error)
    const message = error instanceof Error ? error.message : String(error)
    return reply.code(message.includes('API key') ? 401 : 503).send({
      error: message,
      hint: 'The public Calibration receipt or its provider may be temporarily unavailable.',
    })
  }
})

try {
  const schedulerWebhookUrl = config.demoWebhookUrl
  if (config.scheduleSeconds > 0 && !schedulerWebhookUrl) {
    throw new Error('PROOFHOOK_DEMO_WEBHOOK_URL is required when the scheduler is enabled')
  }
  await app.listen({ host: config.host, port: config.port })

  void runDueWalletMonitors()
  const walletScheduleInterval = setInterval(() => void runDueWalletMonitors(), 60_000)
  walletScheduleInterval.unref()

  if (config.scheduleSeconds > 0 && schedulerWebhookUrl) {
    let schedulerRunning = false
    const interval = setInterval(async () => {
      if (schedulerRunning) return
      schedulerRunning = true
      try {
        const result = await runDemoHealthCheck(schedulerWebhookUrl)
        app.log.info(
          { eventId: result.event.id, state: result.health.state, delivered: result.delivery.ok },
          'Scheduled Filecoin check completed'
        )
      } catch (error) {
        app.log.error(error, 'Scheduled Filecoin check failed')
      } finally {
        schedulerRunning = false
      }
    }, config.scheduleSeconds * 1_000)
    interval.unref()
  }
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
