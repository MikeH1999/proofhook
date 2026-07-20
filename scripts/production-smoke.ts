const baseUrl = (process.env.PROOFHOOK_BASE_URL ?? 'https://proofhook-production.up.railway.app').replace(/\/$/, '')
const walletAddress = '0x02eD611363324eAAA10Dd81c26029570850B30B9'
const wrongWalletAddress = '0x0000000000000000000000000000000000000001'
const pieceCid = 'bafkzcibd7abqltt56fv3bmluogfje7chexq4teeo6cyiyjz2eb2kcflkpj5uujak'

interface HttpResult {
  status: number
  body: Record<string, any>
  text: string
}

async function request(path: string, init?: RequestInit, timeoutMs = 120_000): Promise<HttpResult> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await response.text()
  let body: Record<string, any> = {}
  try {
    body = JSON.parse(text) as Record<string, any>
  } catch {
    body = { text: text.slice(0, 500) }
  }
  return { status: response.status, body, text }
}

function jsonPost(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
  console.log(`PASS ${message}`)
}

const health = await request('/api/health')
assert(health.status === 200 && health.body.ok === true, 'health endpoint is ready')

const appPage = await request('/')
const appBundle = await request('/app.bundle.js')
assert(
  appPage.status === 200 &&
    appPage.text.includes('Upload to FOC') &&
    appPage.text.includes('Choose file') &&
    appPage.text.includes('No file selected') &&
    appPage.text.includes('Maximum file size: 500 MB') &&
    appPage.text.includes('Health status definitions') &&
    appPage.text.includes('Repair to 2 copies') &&
    appPage.text.includes('wallet is offline') &&
    appPage.text.includes('<th>Reason</th>') &&
    appPage.text.includes('Check every copy automatically') &&
    appPage.text.includes('Health run groups'),
  'FOC upload and scheduled monitor UI are deployed'
)
assert(
  appBundle.status === 200 &&
    appBundle.text.length > 100_000 &&
    appBundle.text.includes('Checking approved providers (up to 10 seconds)') &&
    appBundle.text.includes('below the 2-copy target'),
  'Synapse provider selection and health reasons are deployed'
)

const storage = await request(`/api/wallet/${walletAddress}/pieces`)
const scheduledMonitor = await request(`/api/wallet/${walletAddress}/monitor`)
const targetPiece = storage.body.pieces?.find((piece: any) => piece.pieceCid === pieceCid)
assert(storage.status === 200, 'wallet storage endpoint responds')
assert(scheduledMonitor.status === 200 && Array.isArray(scheduledMonitor.body.runs), 'wallet schedule groups are readable')
assert(storage.body.address?.toLowerCase() === walletAddress.toLowerCase(), 'storage is scoped to the requested wallet')
assert(storage.body.dataSets?.length >= 5, 'wallet exposes the known FOC data sets plus any new uploads')
assert(targetPiece?.copies?.length === 2, 'target PieceCID has two provider copies')
assert(
  targetPiece.copies.map((copy: any) => String(copy.providerId)).sort().join(',') === '2,4',
  'target copies are on providers 2 and 4'
)

const wrongWallet = await request(
  '/api/wallet/check',
  jsonPost({ walletAddress: wrongWalletAddress, pieceCid })
)
assert(wrongWallet.status === 400, 'a wallet cannot check another wallet\'s PieceCID')

const unscopedDeliveries = await request('/api/deliveries')
const unscopedInbox = await request('/demo/inbox')
assert(unscopedDeliveries.status === 401, 'unscoped delivery history requires admin access')
assert(unscopedInbox.status === 401, 'unscoped receiver inbox requires admin access')

const scopedDeliveries = await request(`/api/deliveries?walletAddress=${walletAddress}`)
const scopedInbox = await request(`/demo/inbox?walletAddress=${walletAddress}`)
assert(scopedDeliveries.status === 200, 'wallet-scoped delivery history is readable')
assert(scopedInbox.status === 200, 'wallet-scoped receiver inbox is readable')

const customTarget = await request(
  '/api/test-webhook',
  jsonPost({ walletAddress, webhookUrl: 'https://example.com/proofhook' })
)
assert(customTarget.status === 401, 'custom webhook targets require admin access')

const testWebhook = await request('/api/test-webhook', jsonPost({ walletAddress }))
assert(testWebhook.status === 200, 'default test webhook is dispatched')
assert(testWebhook.body.delivery?.ok === true, 'default test webhook delivery succeeds')
assert(testWebhook.body.delivery?.status === 202, 'receiver accepts the test webhook with HTTP 202')

const inboxAfterTest = await request(`/demo/inbox?walletAddress=${walletAddress}`)
const testEventId = testWebhook.body.event?.id
const receivedTest = inboxAfterTest.body.events?.find((entry: any) => entry.event?.id === testEventId)
assert(receivedTest?.signatureVerified === true, 'test webhook HMAC signature is verified')

const realCheck = await request('/api/wallet/check', jsonPost({ walletAddress, pieceCid }), 180_000)
assert(realCheck.status === 200, 'real Calibration health check completes')
assert(realCheck.body.health?.state === 'healthy', 'real PieceCID health is healthy')
assert(realCheck.body.health?.copies?.length === 2, 'real health result includes both copies')
assert(
  realCheck.body.health.copies.every(
    (copy: any) => copy.retrievalVerified === true && copy.proofOverdue === false
  ),
  'both copies pass PDP freshness and retrieval verification'
)
assert(realCheck.body.delivery?.status === 202, 'real health event reaches the signed receiver')

const inboxAfterCheck = await request(`/demo/inbox?walletAddress=${walletAddress}`)
const healthEventId = realCheck.body.event?.id
const receivedHealth = inboxAfterCheck.body.events?.find((entry: any) => entry.event?.id === healthEventId)
assert(receivedHealth?.signatureVerified === true, 'real health event HMAC signature is verified')

const rateStatuses: number[] = []
for (let index = 0; index < 61; index += 1) {
  rateStatuses.push((await request('/api/demo-receipt')).status)
}
assert(rateStatuses.slice(0, 60).every((status) => status === 200), 'first 60 public reads are allowed')
assert(rateStatuses[60] === 429, 'the 61st public read is rate limited')

console.log(`Production smoke test passed for ${baseUrl}`)
