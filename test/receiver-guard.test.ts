import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { InvalidWebhookRateGuard } from '../src/webhooks/receiver-guard.js'

describe('invalid webhook abuse guard', () => {
  it('limits invalid attempts per IP and resets after the window', () => {
    const guard = new InvalidWebhookRateGuard(10, 60_000)
    for (let index = 0; index < 10; index += 1) assert.equal(guard.allow('203.0.113.8', 0), true)
    assert.equal(guard.allow('203.0.113.8', 0), false)
    assert.equal(guard.allow('203.0.113.9', 0), true)
    assert.equal(guard.allow('203.0.113.8', 60_000), true)
  })
})
