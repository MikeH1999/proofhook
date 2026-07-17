import 'dotenv/config'
import { resolve } from 'node:path'
import { z } from 'zod'

const privateKeySchema = z
  .string()
  .regex(/^(?:0x)?[0-9a-fA-F]{64}$/, 'Expected a 32-byte hexadecimal private key')
  .transform((value) => (value.startsWith('0x') ? value : `0x${value}`) as `0x${string}`)

export interface AppConfig {
  host: string
  port: number
  webhookSecret: string
  demoWebhookUrl: string | null
  receiptPath: string
  deliveryLogPath: string
  allowPrivateWebhookUrls: boolean
  scheduleSeconds: number
  adminKey: string | null
  providerIds: bigint[]
}

export function loadConfig(): AppConfig {
  const port = Number(process.env.PORT ?? 3000)
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535')
  }

  const providerIds = (process.env.PROOFHOOK_PROVIDER_IDS ?? '4,2')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => BigInt(value))
  if (providerIds.length !== 2 || new Set(providerIds.map(String)).size !== 2) {
    throw new Error('PROOFHOOK_PROVIDER_IDS must contain exactly two distinct provider IDs')
  }
  const scheduleSeconds = Number(process.env.PROOFHOOK_SCHEDULE_SECONDS ?? 0)
  if (!Number.isFinite(scheduleSeconds) || scheduleSeconds < 0) {
    throw new Error('PROOFHOOK_SCHEDULE_SECONDS must be zero or a positive number')
  }
  const rawDemoWebhookUrl = process.env.PROOFHOOK_DEMO_WEBHOOK_URL?.trim()

  return {
    host: process.env.HOST ?? '127.0.0.1',
    port,
    webhookSecret: process.env.PROOFHOOK_WEBHOOK_SECRET ?? 'proofhook-local-development-secret',
    demoWebhookUrl:
      rawDemoWebhookUrl && rawDemoWebhookUrl.toLowerCase() !== 'auto'
        ? rawDemoWebhookUrl
        : null,
    receiptPath: resolve(process.env.PROOFHOOK_RECEIPT_PATH ?? 'data/demo-receipt.json'),
    deliveryLogPath: resolve(process.env.PROOFHOOK_DELIVERY_LOG_PATH ?? 'data/delivery-log.json'),
    allowPrivateWebhookUrls: process.env.PROOFHOOK_ALLOW_PRIVATE_WEBHOOK_URLS !== 'false',
    scheduleSeconds,
    adminKey: process.env.PROOFHOOK_ADMIN_KEY?.trim() || null,
    providerIds,
  }
}

export function requirePrivateKey(): `0x${string}` {
  const parsedPrivateKey = privateKeySchema.safeParse(process.env.FILECOIN_PRIVATE_KEY)
  if (!parsedPrivateKey.success) {
    throw new Error('FILECOIN_PRIVATE_KEY is not configured. Add a Calibration-only key to .env.')
  }
  return parsedPrivateKey.data
}
