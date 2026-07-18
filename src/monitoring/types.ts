import type { DeliveryResult } from '../webhooks/delivery.js'
import type { HealthState, PieceHealth } from '../domain/types.js'

export interface WalletMonitor {
  walletAddress: string
  intervalHours: number
  enabled: boolean
  createdAt: string
  updatedAt: string
  lastRunAt: string | null
  nextRunAt: string | null
  webhookUrl: string
  lastAuthorization: string
}

export type PublicWalletMonitor = Omit<WalletMonitor, 'webhookUrl' | 'lastAuthorization'>

export interface MonitorPieceResult {
  pieceCid: string
  state: HealthState
  copyCount: number
  healthyCopyCount: number
  eventId: string | null
  delivery: DeliveryResult | null
  health: PieceHealth | null
  error: string | null
}

export interface MonitorRun {
  id: string
  walletAddress: string
  intervalHours: number
  startedAt: string
  completedAt: string
  state: HealthState
  pieceCount: number
  copyCount: number
  healthyCopyCount: number
  webhooksDelivered: number
  webhooksTotal: number
  results: MonitorPieceResult[]
  error: string | null
}

export function publicMonitor(monitor: WalletMonitor | null): PublicWalletMonitor | null {
  if (!monitor) return null
  const { webhookUrl: _webhookUrl, lastAuthorization: _lastAuthorization, ...visible } = monitor
  return visible
}
