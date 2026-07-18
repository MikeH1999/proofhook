import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { privateKeyToAccount } from 'viem/accounts'
import {
  buildMonitorAuthorizationMessage,
  verifyMonitorAuthorization,
} from '../src/monitoring/authorization.js'

const account = privateKeyToAccount(`0x${'11'.repeat(32)}`)
const otherAccount = privateKeyToAccount(`0x${'22'.repeat(32)}`)
const now = new Date('2026-07-18T06:00:00.000Z')

describe('scheduled monitor authorization', () => {
  it('accepts a fresh signature from the configured wallet', async () => {
    const issuedAt = now.toISOString()
    const message = buildMonitorAuthorizationMessage(account.address, 3, true, true, issuedAt)
    const signature = await account.signMessage({ message })
    await verifyMonitorAuthorization(
      { walletAddress: account.address, intervalHours: 3, enabled: true, runNow: true, issuedAt, signature },
      now
    )
  })

  it('rejects another wallet and expired authorizations', async () => {
    const issuedAt = now.toISOString()
    const message = buildMonitorAuthorizationMessage(account.address, 6, true, false, issuedAt)
    const wrongSignature = await otherAccount.signMessage({ message })
    await assert.rejects(
      verifyMonitorAuthorization(
        { walletAddress: account.address, intervalHours: 6, enabled: true, runNow: false, issuedAt, signature: wrongSignature },
        now
      ),
      /does not match/
    )

    const signature = await account.signMessage({ message })
    await assert.rejects(
      verifyMonitorAuthorization(
        { walletAddress: account.address, intervalHours: 6, enabled: true, runNow: false, issuedAt, signature },
        new Date(now.getTime() + 6 * 60_000)
      ),
      /expired/
    )
  })
})
