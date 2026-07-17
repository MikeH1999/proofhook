import type { ProofhookEvent } from '../domain/types.js'
import { signWebhook } from './signature.js'

export interface DeliveryResult {
  ok: boolean
  status: number | null
  responseExcerpt: string
  durationMs: number
  error: string | null
  attempts: number
}

export async function deliverWebhook(
  url: string,
  event: ProofhookEvent,
  secret: string,
  timeoutMs = 10_000
): Promise<DeliveryResult> {
  const rawBody = JSON.stringify(event)
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const startedAt = performance.now()

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Proofhook/0.1',
        'x-proofhook-event-id': event.id,
        'x-proofhook-timestamp': timestamp,
        'x-proofhook-signature': signWebhook(rawBody, timestamp, secret),
      },
      body: rawBody,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
    })
    const responseText = (await response.text()).slice(0, 2_048)
    return {
      ok: response.ok,
      status: response.status,
      responseExcerpt: responseText,
      durationMs: Math.round(performance.now() - startedAt),
      error: response.ok ? null : `Receiver returned HTTP ${response.status}`,
      attempts: 1,
    }
  } catch (error) {
    return {
      ok: false,
      status: null,
      responseExcerpt: '',
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
      attempts: 1,
    }
  }
}

export async function deliverWebhookWithRetry(
  url: string,
  event: ProofhookEvent,
  secret: string,
  retryDelaysMs: number[] = [0, 2_000, 5_000]
): Promise<DeliveryResult> {
  let lastResult: DeliveryResult | null = null

  for (let attempt = 0; attempt < retryDelaysMs.length; attempt++) {
    const delay = retryDelaysMs[attempt] ?? 0
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    const result = await deliverWebhook(url, event, secret)
    lastResult = { ...result, attempts: attempt + 1 }
    if (result.ok) return lastResult
  }

  if (!lastResult) throw new Error('At least one delivery attempt is required')
  return lastResult
}
