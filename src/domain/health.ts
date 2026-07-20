import type { CopyHealth, HealthState, PieceHealth } from './types.js'

export function calculateHealthState(copies: CopyHealth[]): HealthState {
  if (copies.length === 0) return 'unknown'

  const verifiedCount = copies.filter((copy) => copy.retrievalVerified).length
  const hasOverdueProof = copies.some((copy) => copy.proofOverdue === true)

  if (verifiedCount === 0) return copies.every((copy) => copy.error !== null) ? 'unhealthy' : 'unknown'
  if (copies.length < 2) return 'degraded'
  if (verifiedCount < copies.length || hasOverdueProof) return 'degraded'
  return 'healthy'
}

export function createPieceHealth(
  pieceCid: string,
  copies: CopyHealth[],
  checkedAt = new Date()
): PieceHealth {
  return {
    state: calculateHealthState(copies),
    checkedAt: checkedAt.toISOString(),
    chain: 'calibration',
    pieceCid,
    copies,
  }
}
