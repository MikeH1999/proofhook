import { randomUUID, timingSafeEqual } from 'node:crypto'
import { resolve } from 'node:path'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import { getAddress, isAddress } from 'viem'
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

const config = loadConfig()
const publicClient = createCalibrationPublicClient()
const app = Fastify({ logger: true, bodyLimit: 256 * 1024, trustProxy: true })
const deliveryStore = new DeliveryStore(config.deliveryLogPath)
await deliveryStore.initialize()

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

app.get('/api/health', async () => ({
  ok: true,
  receiptPath: config.receiptPath,
  schedulerEnabled: config.scheduleSeconds > 0,
  scheduleSeconds: config.scheduleSeconds,
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

    const receipt = parseReceipt({
      chain: 'calibration',
      pieceCid: selectedPiece.pieceCid,
      size: 1,
      createdAt: new Date().toISOString(),
      transactionHashes: [],
      copies: selectedPiece.copies.map((copy, index) => ({
        providerId: copy.providerId,
        dataSetId: copy.dataSetId,
        pieceId: copy.pieceId,
        retrievalUrl: copy.retrievalUrl,
        role: index === 0 ? 'primary' : 'secondary',
      })),
    })
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
