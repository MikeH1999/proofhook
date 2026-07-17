import type { CopyHealth, HealthState, PieceHealth } from './types.js'

export function calculateHealthState(copies: CopyHealth[]): HealthState {
  if (copies.length === 0) return 'unknown'

  const verifiedCount = copies.filter((copy) => copy.retrievalVerified).length
  const knownProofs = copies.filter((copy) => copy.proofOverdue !== null)
  const allKnownProofsOverdue =
    knownProofs.length === copies.length && knownProofs.every((copy) => copy.proofOverdue)

  if (verifiedCount === 0) return copies.every((copy) => copy.error !== null) ? 'unhealthy' : 'unknown'
  if (verifiedCount < copies.length || allKnownProofsOverdue) return 'degraded'
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
