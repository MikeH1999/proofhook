import { getEndorsedProviderIds } from '@filoz/synapse-core/endorsements'
import { getApprovedProviderIds } from '@filoz/synapse-core/warm-storage'
import { requirePrivateKey } from '../src/config.js'
import { createCalibrationSynapse } from '../src/filecoin/client.js'

const synapse = createCalibrationSynapse(requirePrivateKey())
const [providers, approved, endorsed] = await Promise.all([
  synapse.providers.getAllActiveProviders(),
  getApprovedProviderIds(synapse.client),
  getEndorsedProviderIds(synapse.client),
])
const approvedSet = new Set(approved.map(String))
const endorsedSet = new Set(endorsed.map(String))

const results = await Promise.all(
  providers.map(async (provider) => {
    const url = new URL('pdp/ping', provider.pdp.serviceURL).toString()
    const startedAt = performance.now()
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      return {
        id: provider.id.toString(),
        approved: approvedSet.has(provider.id.toString()),
        endorsed: endorsedSet.has(provider.id.toString()),
        serviceUrl: provider.pdp.serviceURL,
        pingStatus: response.status,
        latencyMs: Math.round(performance.now() - startedAt),
        error: null,
      }
    } catch (error) {
      return {
        id: provider.id.toString(),
        approved: approvedSet.has(provider.id.toString()),
        endorsed: endorsedSet.has(provider.id.toString()),
        serviceUrl: provider.pdp.serviceURL,
        pingStatus: null,
        latencyMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })
)

console.log(JSON.stringify({ approved: approved.map(String), endorsed: endorsed.map(String), providers: results }, null, 2))
