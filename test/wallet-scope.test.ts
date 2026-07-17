import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import type { ProofhookEvent } from '../src/domain/types.js'
import { DeliveryStore } from '../src/storage/delivery-store.js'

describe('wallet-scoped delivery history', () => {
  let directory = ''
  let store: DeliveryStore

  before(async () => {
    directory = await mkdtemp(join(tmpdir(), 'proofhook-wallet-scope-'))
    store = new DeliveryStore(join(directory, 'deliveries.json'))
    await store.initialize()
  })

  after(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  async function append(id: string, walletAddress?: string) {
    const event: ProofhookEvent = {
      id,
      type: 'webhook.test',
      createdAt: new Date().toISOString(),
      subscriptionId: id,
      chain: 'calibration',
      data: {
        message: 'wallet filter test',
        ...(walletAddress ? { walletAddress } : {}),
      },
    }
    await store.append({
      id,
      createdAt: event.createdAt,
      event,
      webhookUrl: 'https://example.com/webhook',
      result: {
        ok: true,
        status: 202,
        responseExcerpt: 'accepted',
        durationMs: 1,
        error: null,
        attempts: 1,
      },
    })
  }

  it('returns only events belonging to the requested wallet', async () => {
    await append('evt_wallet_a', '0x00000000000000000000000000000000000000Aa')
    await append('evt_wallet_b', '0x00000000000000000000000000000000000000Bb')
    await append('evt_unscoped')

    const records = store.list(50, '0x00000000000000000000000000000000000000aa')
    assert.deepEqual(records.map((record) => record.id), ['evt_wallet_a'])
  })
})
