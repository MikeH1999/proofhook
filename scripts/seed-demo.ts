import { loadConfig, requirePrivateKey } from '../src/config.js'
import { createCalibrationSynapse } from '../src/filecoin/client.js'
import { writeReceipt } from '../src/filecoin/receipt.js'
import type { DemoReceipt } from '../src/domain/types.js'

const config = loadConfig()
const synapse = createCalibrationSynapse(requirePrivateKey())
const address = synapse.client.account.address

const content = [
  'Proofhook Calibration restore fixture.',
  'This content is intentionally stable so every retrieval can be verified against the same PieceCID.',
  `Created for wallet ${address}.`,
  'Filecoin Onchain Cloud turns storage, proof status, and retrieval health into signed webhooks.',
].join('\n')
const data = new TextEncoder().encode(content.padEnd(512, '.'))

console.log(`Calibration wallet: ${address}`)
console.log(`Preparing ${data.byteLength} bytes across 2 providers...`)

const contexts = await synapse.storage.createContexts({
  providerIds: config.providerIds,
  metadata: { application: 'Proofhook', environment: 'calibration-demo' },
})
const preparation = await synapse.storage.prepare({ context: contexts, dataSize: BigInt(data.byteLength) })

if (preparation.transaction) {
  console.log(
    `Account preparation required: deposit=${preparation.transaction.depositAmount}, approval=${preparation.transaction.includesApproval}`
  )
  const prepared = await preparation.transaction.execute({
    onHash: (hash) => console.log(`Preparation transaction: ${hash}`),
  })
  console.log(`Account prepared: ${prepared.hash}`)
}

const transactionHashes: string[] = []
const result = await synapse.storage.upload(data, {
  contexts,
  pieceMetadata: { name: 'proofhook-demo.txt', contentType: 'text/plain' },
  callbacks: {
    onStored: (providerId, pieceCid) => console.log(`Stored on primary provider ${providerId}: ${pieceCid}`),
    onCopyComplete: (providerId) => console.log(`Secondary provider ${providerId} pulled the piece`),
    onPiecesAdded: (hash, providerId) => {
      transactionHashes.push(hash)
      console.log(`Provider ${providerId} commit submitted: ${hash}`)
    },
    onPiecesConfirmed: (dataSetId, providerId) =>
      console.log(`Provider ${providerId} confirmed data set ${dataSetId}`),
  },
})

if (!result.complete) {
  throw new Error(
    `Seed upload was only partially successful (${result.copies.length}/${result.requestedCopies}). ` +
      `Failed attempts: ${JSON.stringify(result.failedAttempts)}`
  )
}

const receipt: DemoReceipt = {
  chain: 'calibration',
  pieceCid: result.pieceCid.toString(),
  size: result.size,
  createdAt: new Date().toISOString(),
  transactionHashes,
  copies: result.copies.map((copy) => ({
    providerId: copy.providerId.toString(),
    dataSetId: copy.dataSetId.toString(),
    pieceId: copy.pieceId.toString(),
    retrievalUrl: copy.retrievalUrl,
    role: copy.role,
  })),
}

await writeReceipt(config.receiptPath, receipt)
console.log(`Seed receipt written to ${config.receiptPath}`)
console.log(JSON.stringify(receipt, null, 2))
