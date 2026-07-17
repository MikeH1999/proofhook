import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assertSafeWebhookUrl, isPrivateIp } from '../src/webhooks/url-safety.js'

describe('webhook URL safety', () => {
  it('identifies private IPv4 ranges', () => {
    assert.equal(isPrivateIp('127.0.0.1'), true)
    assert.equal(isPrivateIp('10.1.2.3'), true)
    assert.equal(isPrivateIp('172.16.0.1'), true)
    assert.equal(isPrivateIp('192.168.1.10'), true)
    assert.equal(isPrivateIp('8.8.8.8'), false)
  })

  it('allows localhost HTTP only in local development mode', async () => {
    assert.equal((await assertSafeWebhookUrl('http://127.0.0.1:3000/hook', true)).hostname, '127.0.0.1')
    await assert.rejects(() => assertSafeWebhookUrl('http://127.0.0.1:3000/hook', false))
  })

  it('rejects URL credentials', async () => {
    await assert.rejects(() => assertSafeWebhookUrl('https://user:pass@example.com/hook', false))
  })
})
