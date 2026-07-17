export type HealthState = 'healthy' | 'degraded' | 'unhealthy' | 'unknown'

export interface DemoReceiptCopy {
  providerId: string
  dataSetId: string
  pieceId: string
  retrievalUrl: string | null
  role: 'primary' | 'secondary'
}

export interface DemoReceipt {
  chain: 'calibration'
  pieceCid: string
  size: number
  createdAt: string
  transactionHashes: string[]
  copies: DemoReceiptCopy[]
}

export interface CopyHealth {
  providerId: string
  dataSetId: string
  pieceId: string | null
  lastProvenAt: string | null
  nextProofDueAt: string | null
  inChallengeWindow: boolean | null
  hoursUntilChallengeWindow: number | null
  proofOverdue: boolean | null
  retrievalUrl: string | null
  retrievalVerified: boolean
  retrievalLatencyMs: number | null
  retrievalBytes: number | null
  error: string | null
}

export interface PieceHealth {
  state: HealthState
  checkedAt: string
  chain: 'calibration'
  pieceCid: string
  copies: CopyHealth[]
  walletAddress?: string
}

export interface ProofhookEvent {
  id: string
  type: 'piece.health.checked' | 'piece.health.degraded' | 'webhook.test'
  createdAt: string
  subscriptionId: string
  chain: 'calibration'
  data: PieceHealth | { message: string; walletAddress?: string }
}
