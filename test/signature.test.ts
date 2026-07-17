import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { signWebhook, verifyWebhookSignature } from '../src/webhooks/signature.js'

describe('webhook signatures', () => {
  const secret = 'test-secret'
  const timestamp = '1784193600'
  const body = JSON.stringify({ type: 'piece.health.checked' })

  it('verifies an unchanged payload', () => {
    const signature = signWebhook(body, timestamp, secret)
    assert.equal(verifyWebhookSignature(body, timestamp, signature, secret), true)
  })

  it('rejects a changed payload', () => {
    const signature = signWebhook(body, timestamp, secret)
    assert.equal(verifyWebhookSignature(`${body} `, timestamp, signature, secret), false)
  })

  it('rejects a malformed signature', () => {
    assert.equal(verifyWebhookSignature(body, timestamp, 'v1=bad', secret), false)
  })
})
