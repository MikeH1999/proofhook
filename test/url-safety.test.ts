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

  it('blocks non-public and IPv4-mapped network ranges', () => {
    assert.equal(isPrivateIp('100.64.0.1'), true)
    assert.equal(isPrivateIp('198.18.0.1'), true)
    assert.equal(isPrivateIp('203.0.113.10'), true)
    assert.equal(isPrivateIp('224.0.0.1'), true)
    assert.equal(isPrivateIp('::ffff:127.0.0.1'), true)
    assert.equal(isPrivateIp('2001:db8::1'), true)
    assert.equal(isPrivateIp('2606:4700:4700::1111'), false)
  })

  it('allows localhost HTTP only in local development mode', async () => {
    assert.equal((await assertSafeWebhookUrl('http://127.0.0.1:3000/hook', true)).hostname, '127.0.0.1')
    await assert.rejects(() => assertSafeWebhookUrl('http://127.0.0.1:3000/hook', false))
  })

  it('rejects URL credentials', async () => {
    await assert.rejects(() => assertSafeWebhookUrl('https://user:pass@example.com/hook', false))
  })
})
