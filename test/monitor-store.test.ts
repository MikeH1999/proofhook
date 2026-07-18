import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { MonitorStore } from '../src/monitoring/store.js'
import type { MonitorRun } from '../src/monitoring/types.js'

describe('scheduled monitor persistence', () => {
  it('persists schedules, rejects replay, and groups completed runs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'proofhook-monitor-'))
    const path = join(directory, 'monitor-state.json')
    const walletAddress = '0x02eD611363324eAAA10Dd81c26029570850B30B9'
    const now = new Date('2026-07-18T06:00:00.000Z')
    try {
      const store = new MonitorStore(path)
      await store.initialize()
      const monitor = await store.upsert({
        walletAddress,
        intervalHours: 3,
        enabled: true,
        webhookUrl: 'https://proofhook.example/demo/receiver',
        authorization: '0xsignature-1',
        runNow: false,
        now,
      })
      assert.equal(monitor.nextRunAt, '2026-07-18T09:00:00.000Z')
      assert.equal(store.due(new Date('2026-07-18T08:59:59.000Z')).length, 0)
      assert.equal(store.due(new Date('2026-07-18T09:00:00.000Z')).length, 1)
      await assert.rejects(
        store.upsert({
          walletAddress,
          intervalHours: 3,
          enabled: true,
          webhookUrl: 'https://proofhook.example/demo/receiver',
          authorization: '0xsignature-1',
          runNow: true,
          now,
        }),
        /already been used/
      )

      const run: MonitorRun = {
        id: 'run_1',
        walletAddress,
        intervalHours: 3,
        startedAt: '2026-07-18T09:00:00.000Z',
        completedAt: '2026-07-18T09:01:00.000Z',
        state: 'healthy',
        pieceCount: 1,
        copyCount: 2,
        healthyCopyCount: 2,
        webhooksDelivered: 1,
        webhooksTotal: 1,
        results: [],
        error: null,
      }
      await store.completeRun(run)
      assert.equal(store.listRuns(walletAddress)[0]?.id, 'run_1')
      assert.equal(store.get(walletAddress)?.lastRunAt, run.completedAt)
      assert.equal(store.get(walletAddress)?.nextRunAt, '2026-07-18T12:01:00.000Z')

      const persisted = JSON.parse(await readFile(path, 'utf8'))
      assert.equal(persisted.monitors.length, 1)
      assert.equal(persisted.runs.length, 1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
