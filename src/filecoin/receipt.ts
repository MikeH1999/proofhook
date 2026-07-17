import { readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { z } from 'zod'
import type { DemoReceipt } from '../domain/types.js'

const receiptSchema = z.object({
  chain: z.literal('calibration'),
  pieceCid: z.string().min(1),
  size: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  transactionHashes: z.array(z.string()),
  copies: z
    .array(
      z.object({
        providerId: z.string().regex(/^\d+$/),
        dataSetId: z.string().regex(/^\d+$/),
        pieceId: z.string().regex(/^\d+$/),
        retrievalUrl: z.string().url().nullable(),
        role: z.enum(['primary', 'secondary']),
      })
    )
    .min(1),
})

export async function readReceipt(path: string): Promise<DemoReceipt> {
  const raw = await readFile(path, 'utf8')
  return parseReceipt(JSON.parse(raw))
}

export function parseReceipt(value: unknown): DemoReceipt {
  return receiptSchema.parse(value)
}

export async function writeReceipt(path: string, receipt: DemoReceipt): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(receiptSchema.parse(receipt), null, 2)}\n`, 'utf8')
}
