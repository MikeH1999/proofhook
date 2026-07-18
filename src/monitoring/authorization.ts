import { getAddress, isAddressEqual, recoverMessageAddress, type Address, type Hex } from 'viem'

export interface MonitorAuthorization {
  walletAddress: Address
  intervalHours: number
  enabled: boolean
  runNow: boolean
  issuedAt: string
  signature: Hex
}

export function buildMonitorAuthorizationMessage(
  walletAddress: string,
  intervalHours: number,
  enabled: boolean,
  runNow: boolean,
  issuedAt: string
): string {
  return [
    'Proofhook scheduled monitor',
    `Wallet: ${getAddress(walletAddress)}`,
    `Interval hours: ${intervalHours}`,
    `Enabled: ${enabled ? 'yes' : 'no'}`,
    `Run now: ${runNow ? 'yes' : 'no'}`,
    `Issued at: ${issuedAt}`,
  ].join('\n')
}

export async function verifyMonitorAuthorization(
  authorization: MonitorAuthorization,
  now = new Date()
): Promise<void> {
  const issuedAt = new Date(authorization.issuedAt)
  if (Number.isNaN(issuedAt.getTime())) throw new Error('Invalid monitor authorization timestamp')
  if (Math.abs(now.getTime() - issuedAt.getTime()) > 5 * 60_000) {
    throw new Error('Monitor authorization expired')
  }
  const message = buildMonitorAuthorizationMessage(
    authorization.walletAddress,
    authorization.intervalHours,
    authorization.enabled,
    authorization.runNow,
    authorization.issuedAt
  )
  const recovered = await recoverMessageAddress({ message, signature: authorization.signature })
  if (!isAddressEqual(recovered, authorization.walletAddress)) {
    throw new Error('Monitor authorization does not match the wallet')
  }
}
