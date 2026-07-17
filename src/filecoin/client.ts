import { calibration, Synapse } from '@filoz/synapse-sdk'
import { createPublicClient, http, type HttpTransport, type PublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

export type CalibrationPublicClient = PublicClient<HttpTransport, typeof calibration>

export function createCalibrationPublicClient(): CalibrationPublicClient {
  return createPublicClient({
    chain: calibration,
    transport: http(),
  })
}

export function createCalibrationSynapse(privateKey: `0x${string}`): Synapse {
  return Synapse.create({
    account: privateKeyToAccount(privateKey),
    chain: calibration,
    source: 'proofhook',
    withCDN: false,
  })
}
