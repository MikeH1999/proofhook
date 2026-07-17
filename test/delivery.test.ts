import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, describe, it } from 'node:test'
import type { ProofhookEvent } from '../src/domain/types.js'
import { deliverWebhookWithRetry } from '../src/webhooks/delivery.js'
import { verifyWebhookSignature } from '../src/webhooks/signature.js'

describe('webhook delivery retries', () => {
  const secret = 'delivery-test-secret'
  let attempts = 0
  let signatureVerified = false
  let url = ''
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    request.on('end', () => {
      attempts++
      const rawBody = Buffer.concat(chunks).toString('utf8')
      signatureVerified = verifyWebhookSignature(
        rawBody,
        String(request.headers['x-proofhook-timestamp'] ?? ''),
        String(request.headers['x-proofhook-signature'] ?? ''),
        secret
      )
      response.statusCode = attempts < 3 ? 500 : 202
      response.end(attempts < 3 ? 'retry' : 'accepted')
    })
  })

  before(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port')
    url = `http://127.0.0.1:${address.port}/receiver`
  })

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  })

  it('retries failures, preserves the signature, and stops after success', async () => {
    const event: ProofhookEvent = {
      id: 'evt_delivery_test',
      type: 'webhook.test',
      createdAt: new Date().toISOString(),
      subscriptionId: 'sub_test',
      chain: 'calibration',
      data: { message: 'test' },
    }
    const result = await deliverWebhookWithRetry(url, event, secret, [0, 5, 5])
    assert.equal(result.ok, true)
    assert.equal(result.status, 202)
    assert.equal(result.attempts, 3)
    assert.equal(attempts, 3)
    assert.equal(signatureVerified, true)
  })
})
