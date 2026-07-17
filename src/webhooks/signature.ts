import { createHmac, timingSafeEqual } from 'node:crypto'

export function signWebhook(rawBody: string, timestamp: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
  return `v1=${digest}`
}

export function verifyWebhookSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
  secret: string
): boolean {
  const expected = signWebhook(rawBody, timestamp, secret)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)

  if (actualBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(actualBuffer, expectedBuffer)
}
