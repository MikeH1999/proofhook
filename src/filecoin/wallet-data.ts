import * as PDPVerifier from '@filoz/synapse-core/pdp-verifier'
import * as WarmStorage from '@filoz/synapse-core/warm-storage'
import * as Piece from '@filoz/synapse-core/piece'
import type { Address } from 'viem'
import { isAddressEqual } from 'viem'
import type { CalibrationPublicClient } from './client.js'

export interface WalletDataSet {
  dataSetId: string
  providerId: string
  providerName: string
  activePieceCount: number
  isLive: boolean
  isManaged: boolean
  withCDN: boolean
}

export interface WalletPieceCopy {
  dataSetId: string
  providerId: string
  providerName: string
  pieceId: string
  retrievalUrl: string
}

export interface WalletPiece {
  pieceCid: string
  copies: WalletPieceCopy[]
}

export interface WalletStorage {
  address: Address
  dataSets: WalletDataSet[]
  pieces: WalletPiece[]
}

const PIECES_PER_PAGE = 100n
const MAX_DATA_SETS = 25
const MAX_PIECES_PER_DATA_SET = 500

export async function getWalletStorage(
  client: CalibrationPublicClient,
  address: Address
): Promise<WalletStorage> {
  const chainDataSets = await WarmStorage.getPdpDataSets(client, { address })
  if (chainDataSets.length > MAX_DATA_SETS) {
    throw new Error(`Wallet has more than ${MAX_DATA_SETS} data sets; narrow querying is not yet supported`)
  }

  for (const dataSet of chainDataSets) {
    if (!isAddressEqual(dataSet.payer, address)) {
      throw new Error(`Data set ${dataSet.dataSetId} does not belong to the connected wallet`)
    }
  }

  const dataSets: WalletDataSet[] = chainDataSets.map((dataSet) => ({
    dataSetId: dataSet.dataSetId.toString(),
    providerId: dataSet.providerId.toString(),
    providerName: dataSet.provider.name || `Provider ${dataSet.providerId}`,
    activePieceCount: Number(dataSet.activePieceCount),
    isLive: dataSet.live,
    isManaged: dataSet.managed,
    withCDN: dataSet.cdn,
  }))

  const copies = await Promise.all(
    chainDataSets.filter((dataSet) => dataSet.live).map(async (dataSet) => {
      const result: Array<{ pieceCid: string; copy: WalletPieceCopy }> = []
      let offset = 0n

      while (result.length < MAX_PIECES_PER_DATA_SET) {
        const page = await PDPVerifier.getActivePieces(client, {
          dataSetId: dataSet.dataSetId,
          offset,
          limit: PIECES_PER_PAGE,
        })
        for (const piece of page.pieces) {
          result.push({
            pieceCid: piece.cid.toString(),
            copy: {
              dataSetId: dataSet.dataSetId.toString(),
              providerId: dataSet.providerId.toString(),
              providerName: dataSet.provider.name || `Provider ${dataSet.providerId}`,
              pieceId: piece.id.toString(),
              retrievalUrl: Piece.createPieceUrlPDP({
                cid: piece.cid.toString(),
                serviceURL: dataSet.provider.pdp.serviceURL,
              }),
            },
          })
        }
        if (!page.hasMore) break
        offset += BigInt(page.pieces.length)
      }
      return result
    })
  )

  const piecesByCid = new Map<string, WalletPiece>()
  for (const item of copies.flat()) {
    const piece = piecesByCid.get(item.pieceCid) ?? { pieceCid: item.pieceCid, copies: [] }
    piece.copies.push(item.copy)
    piecesByCid.set(item.pieceCid, piece)
  }

  return {
    address,
    dataSets,
    pieces: [...piecesByCid.values()].sort((left, right) =>
      left.pieceCid.localeCompare(right.pieceCid)
    ),
  }
}
