import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ProofhookEvent } from '../domain/types.js'
import type { DeliveryResult } from '../webhooks/delivery.js'

export interface DeliveryLogRecord {
  id: string
  createdAt: string
  event: ProofhookEvent
  result: DeliveryResult
  webhookUrl: string
}

export class DeliveryStore {
  private records: DeliveryLogRecord[] = []
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly path: string) {}

  async initialize(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    try {
      const raw = await readFile(this.path, 'utf8')
      const parsed = JSON.parse(raw)
      this.records = Array.isArray(parsed) ? parsed : []
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await this.flush()
    }
  }

  list(limit = 50, walletAddress?: string): DeliveryLogRecord[] {
    const normalizedWallet = walletAddress?.toLowerCase()
    const records = normalizedWallet
      ? this.records.filter((record) =>
          record.event.data.walletAddress?.toLowerCase() === normalizedWallet
        )
      : this.records
    return records.slice(0, Math.max(1, Math.min(limit, 200)))
  }

  async append(record: DeliveryLogRecord): Promise<void> {
    this.records.unshift(record)
    if (this.records.length > 500) this.records.length = 500
    this.writeQueue = this.writeQueue.then(() => this.flush())
    await this.writeQueue
  }

  private async flush(): Promise<void> {
    const temporaryPath = `${this.path}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(this.records, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, this.path)
  }
}
