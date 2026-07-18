import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { MonitorRun, WalletMonitor } from './types.js'

interface MonitorState {
  monitors: WalletMonitor[]
  runs: MonitorRun[]
}

export class MonitorStore {
  private state: MonitorState = { monitors: [], runs: [] }
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly path: string) {}

  async initialize(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    try {
      const raw = await readFile(this.path, 'utf8')
      const parsed = JSON.parse(raw) as Partial<MonitorState>
      this.state = {
        monitors: Array.isArray(parsed.monitors) ? parsed.monitors : [],
        runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await this.flush()
    }
  }

  get(walletAddress: string): WalletMonitor | null {
    const normalized = walletAddress.toLowerCase()
    return this.state.monitors.find((monitor) => monitor.walletAddress.toLowerCase() === normalized) ?? null
  }

  listRuns(walletAddress: string, limit = 20): MonitorRun[] {
    const normalized = walletAddress.toLowerCase()
    return this.state.runs
      .filter((run) => run.walletAddress.toLowerCase() === normalized)
      .slice(0, Math.max(1, Math.min(limit, 100)))
  }

  due(now = new Date()): WalletMonitor[] {
    const nowMs = now.getTime()
    return this.state.monitors.filter(
      (monitor) => monitor.enabled && monitor.nextRunAt !== null && new Date(monitor.nextRunAt).getTime() <= nowMs
    )
  }

  async upsert(input: {
    walletAddress: string
    intervalHours: number
    enabled: boolean
    webhookUrl: string
    authorization: string
    runNow: boolean
    now?: Date
  }): Promise<WalletMonitor> {
    const existing = this.get(input.walletAddress)
    if (existing?.lastAuthorization === input.authorization) {
      throw new Error('Monitor authorization has already been used')
    }
    const now = input.now ?? new Date()
    const nowIso = now.toISOString()
    const nextRunAt = input.enabled
      ? new Date(now.getTime() + (input.runNow ? 0 : input.intervalHours * 60 * 60_000)).toISOString()
      : null
    const monitor: WalletMonitor = {
      walletAddress: input.walletAddress,
      intervalHours: input.intervalHours,
      enabled: input.enabled,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
      lastRunAt: existing?.lastRunAt ?? null,
      nextRunAt,
      webhookUrl: input.webhookUrl,
      lastAuthorization: input.authorization,
    }
    const normalized = input.walletAddress.toLowerCase()
    this.state.monitors = [
      monitor,
      ...this.state.monitors.filter((item) => item.walletAddress.toLowerCase() !== normalized),
    ]
    await this.enqueueFlush()
    return monitor
  }

  async completeRun(run: MonitorRun): Promise<WalletMonitor | null> {
    const monitor = this.get(run.walletAddress)
    this.state.runs.unshift(run)
    if (this.state.runs.length > 500) this.state.runs.length = 500
    if (monitor) {
      monitor.lastRunAt = run.completedAt
      monitor.nextRunAt = monitor.enabled
        ? new Date(new Date(run.completedAt).getTime() + monitor.intervalHours * 60 * 60_000).toISOString()
        : null
      monitor.updatedAt = run.completedAt
    }
    await this.enqueueFlush()
    return monitor
  }

  private async enqueueFlush(): Promise<void> {
    this.writeQueue = this.writeQueue.then(() => this.flush())
    await this.writeQueue
  }

  private async flush(): Promise<void> {
    const temporaryPath = `${this.path}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, this.path)
  }
}
