import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { calculateHealthState } from '../src/domain/health.js'
import type { CopyHealth } from '../src/domain/types.js'

function copy(overrides: Partial<CopyHealth> = {}): CopyHealth {
  return {
    providerId: '1',
    dataSetId: '10',
    pieceId: '1',
    lastProvenAt: null,
    nextProofDueAt: null,
    inChallengeWindow: false,
    hoursUntilChallengeWindow: 1,
    proofOverdue: false,
    retrievalUrl: 'https://provider.example/piece',
    retrievalVerified: true,
    retrievalLatencyMs: 100,
    retrievalBytes: 512,
    error: null,
    ...overrides,
  }
}

describe('calculateHealthState', () => {
  it('is healthy when all copies retrieve and proofs are current', () => {
    assert.equal(calculateHealthState([copy(), copy({ providerId: '2' })]), 'healthy')
  })

  it('is degraded with only one healthy copy', () => {
    assert.equal(calculateHealthState([copy()]), 'degraded')
  })

  it('is degraded when only one copy retrieves', () => {
    assert.equal(
      calculateHealthState([
        copy(),
        copy({ providerId: '2', retrievalVerified: false, error: 'unreachable' }),
      ]),
      'degraded'
    )
  })

  it('is degraded when all proofs are overdue but retrieval works', () => {
    assert.equal(
      calculateHealthState([copy({ proofOverdue: true }), copy({ providerId: '2', proofOverdue: true })]),
      'degraded'
    )
  })

  it('is degraded when any provider proof is overdue', () => {
    assert.equal(
      calculateHealthState([copy({ proofOverdue: true }), copy({ providerId: '2' })]),
      'degraded'
    )
  })

  it('is unhealthy when every copy fails', () => {
    assert.equal(
      calculateHealthState([
        copy({ retrievalVerified: false, error: 'timeout' }),
        copy({ providerId: '2', retrievalVerified: false, error: 'offline' }),
      ]),
      'unhealthy'
    )
  })

  it('is unknown with no copies', () => {
    assert.equal(calculateHealthState([]), 'unknown')
  })
})
