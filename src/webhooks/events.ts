import { createHash, randomUUID } from 'node:crypto'
import type { PieceHealth, ProofhookEvent } from '../domain/types.js'

export function buildHealthEvent(
  health: PieceHealth,
  subscriptionId = 'demo-subscription'
): ProofhookEvent {
  return {
    id: `evt_${randomUUID()}`,
    type: health.state === 'healthy' ? 'piece.health.checked' : 'piece.health.degraded',
    createdAt: new Date().toISOString(),
    subscriptionId,
    chain: 'calibration',
    data: health,
  }
}

export function statusFingerprint(health: PieceHealth): string {
  const stableStatus = {
    state: health.state,
    copies: health.copies.map((copy) => ({
      providerId: copy.providerId,
      dataSetId: copy.dataSetId,
      proofOverdue: copy.proofOverdue,
      retrievalVerified: copy.retrievalVerified,
    })),
  }
  return createHash('sha256').update(JSON.stringify(stableStatus)).digest('hex')
}
