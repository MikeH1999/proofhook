import { calibration } from '@filoz/synapse-sdk'
import * as PDPVerifier from '@filoz/synapse-core/pdp-verifier'
import * as Piece from '@filoz/synapse-core/piece'
import { calculateLastProofDate, epochToDate, timeUntilEpoch } from '@filoz/synapse-core/utils'
import { readContract } from 'viem/actions'
import type { CopyHealth, DemoReceipt, DemoReceiptCopy, PieceHealth } from '../domain/types.js'
import { createPieceHealth } from '../domain/health.js'
import type { CalibrationPublicClient } from './client.js'

function isoOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function checkCopy(
  client: CalibrationPublicClient,
  pieceCid: Piece.PieceCID,
  copy: DemoReceiptCopy,
  timeoutMs: number,
  currentEpoch: number,
  pdpConfig: {
    maxProvingPeriod: bigint
    challengeWindowSize: bigint
  }
): Promise<CopyHealth> {
  const base: CopyHealth = {
    providerId: copy.providerId,
    dataSetId: copy.dataSetId,
    pieceId: copy.pieceId,
    lastProvenAt: null,
    nextProofDueAt: null,
    inChallengeWindow: null,
    hoursUntilChallengeWindow: null,
    proofOverdue: null,
    retrievalUrl: copy.retrievalUrl,
    retrievalVerified: false,
    retrievalLatencyMs: null,
    retrievalBytes: null,
    error: null,
  }

  try {
    const dataSetId = BigInt(copy.dataSetId)
    const [pieceIds, nextChallengeEpoch] = await Promise.all([
      PDPVerifier.findPieceIdsByCid(client, {
        dataSetId,
        pieceCid,
        startPieceId: 0n,
        limit: 1n,
      }),
      PDPVerifier.getNextChallengeEpoch(client, { dataSetId }),
    ])
    if (pieceIds.length === 0) {
      return { ...base, error: 'Piece was not found in this data set' }
    }

    let lastProvenAt: string | null = null
    let nextProofDueAt: string | null = null
    let inChallengeWindow: boolean | null = null
    let hoursUntilChallengeWindow: number | null = null
    let proofOverdue: boolean | null = null

    if (nextChallengeEpoch !== null) {
      const challengeWindowStart = Number(nextChallengeEpoch)
      const provingDeadline = challengeWindowStart + Number(pdpConfig.challengeWindowSize)
      const lastProof = calculateLastProofDate(
        challengeWindowStart,
        Number(pdpConfig.maxProvingPeriod),
        calibration.genesisTimestamp
      )
      lastProvenAt = isoOrNull(lastProof)
      nextProofDueAt = epochToDate(provingDeadline, calibration.genesisTimestamp).toISOString()
      inChallengeWindow = currentEpoch >= challengeWindowStart && currentEpoch < provingDeadline
      proofOverdue = currentEpoch >= provingDeadline
      hoursUntilChallengeWindow =
        currentEpoch < challengeWindowStart
          ? timeUntilEpoch(challengeWindowStart, currentEpoch).hours
          : 0
    }

    const statusFields: Pick<
      CopyHealth,
      | 'pieceId'
      | 'lastProvenAt'
      | 'nextProofDueAt'
      | 'inChallengeWindow'
      | 'hoursUntilChallengeWindow'
      | 'proofOverdue'
      | 'retrievalUrl'
    > = {
      pieceId: pieceIds[0]?.toString() ?? copy.pieceId,
      lastProvenAt,
      nextProofDueAt,
      inChallengeWindow,
      hoursUntilChallengeWindow,
      proofOverdue,
      retrievalUrl: copy.retrievalUrl,
    }

    const startedAt = performance.now()
    try {
      if (!copy.retrievalUrl) throw new Error('Receipt does not include a retrieval URL')
      const bytes = await Piece.downloadAndValidate({
        url: copy.retrievalUrl,
        expectedPieceCid: pieceCid,
        retryCount: 0,
        signal: AbortSignal.timeout(timeoutMs),
      })
      return {
        ...base,
        ...statusFields,
        retrievalVerified: true,
        retrievalLatencyMs: Math.round(performance.now() - startedAt),
        retrievalBytes: bytes.byteLength,
      }
    } catch (error) {
      return {
        ...base,
        ...statusFields,
        retrievalLatencyMs: Math.round(performance.now() - startedAt),
        error: `Retrieval failed: ${errorMessage(error)}`,
      }
    }
  } catch (error) {
    return { ...base, error: `Status check failed: ${errorMessage(error)}` }
  }
}

export async function checkReceipt(
  client: CalibrationPublicClient,
  receipt: DemoReceipt,
  timeoutMs = 15_000
): Promise<PieceHealth> {
  const pieceCid = Piece.from(receipt.pieceCid)
  const [currentEpoch, pdpConfigValues] = await Promise.all([
    client.getBlockNumber().then(Number),
    readContract(client, {
      address: calibration.contracts.fwssView.address,
      abi: calibration.contracts.fwssView.abi,
      functionName: 'getPDPConfig',
    }),
  ])
  const pdpConfig = {
    maxProvingPeriod: pdpConfigValues[0],
    challengeWindowSize: pdpConfigValues[1],
  }
  const copies = await Promise.all(
    receipt.copies.map((copy) =>
      checkCopy(client, pieceCid, copy, timeoutMs, currentEpoch, pdpConfig)
    )
  )
  return createPieceHealth(receipt.pieceCid, copies)
}
