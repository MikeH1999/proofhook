import { Synapse, calibration } from '@filoz/synapse-sdk'
import { custom, getAddress } from 'viem'

const CALIBRATION_CHAIN_ID = '0x4cb2f'
const CALIBRATION_CHAIN_ID_DECIMAL = 314159
const UPLOAD_PROVIDER_IDS = [4n, 2n]
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

const state = {
  walletAddress: null,
  walletChainId: null,
  dataSets: [],
  pieces: [],
  selectedPiece: null,
  health: null,
  deliveries: [],
  inbox: [],
  loadVersion: 0,
  uploading: false,
}

const elements = {
  walletButton: document.querySelector('#wallet-button'),
  walletButtonLabel: document.querySelector('#wallet-button-label'),
  switchWallet: document.querySelector('#switch-wallet'),
  networkStatus: document.querySelector('#network-status'),
  walletScope: document.querySelector('#wallet-scope'),
  pieceSelect: document.querySelector('#piece-select'),
  pieceMeta: document.querySelector('#piece-meta'),
  runCheck: document.querySelector('#run-check'),
  sendTest: document.querySelector('#send-test'),
  copyCid: document.querySelector('#copy-cid'),
  pieceCid: document.querySelector('#piece-cid'),
  overallHealth: document.querySelector('#overall-health'),
  lastChecked: document.querySelector('#last-checked'),
  copyCount: document.querySelector('#copy-count'),
  providerRows: document.querySelector('#provider-rows'),
  deliveryCount: document.querySelector('#delivery-count'),
  deliveryRows: document.querySelector('#delivery-rows'),
  payloadView: document.querySelector('#payload-view'),
  signatureState: document.querySelector('#signature-state'),
  toast: document.querySelector('#toast'),
  uploadFile: document.querySelector('#upload-file'),
  uploadButton: document.querySelector('#upload-button'),
  uploadStatus: document.querySelector('#upload-status'),
  uploadProgress: document.querySelector('#upload-progress'),
  uploadResult: document.querySelector('#upload-result'),
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function shortCid(cid) {
  return cid.length > 28 ? `${cid.slice(0, 18)}...${cid.slice(-8)}` : cid
}

function formatDate(value) {
  if (!value) return 'Pending first proof'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(value))
}

function statusClass(value) {
  const normalized = String(value).toLowerCase()
  if (['healthy', 'success', 'verified', 'delivered'].includes(normalized)) return 'status-success'
  if (['degraded', 'pending'].includes(normalized)) return 'status-degraded'
  if (['unhealthy', 'failed', 'overdue'].includes(normalized)) return 'status-failed'
  return 'status-unknown'
}

function showToast(message, error = false) {
  elements.toast.textContent = message
  elements.toast.className = `toast visible${error ? ' error' : ''}`
  clearTimeout(showToast.timer)
  showToast.timer = setTimeout(() => { elements.toast.className = 'toast' }, 3200)
}

async function request(url, options) {
  const response = await fetch(url, options)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? `Request failed with HTTP ${response.status}`)
  return data
}

function isCalibration() {
  return Number(state.walletChainId) === CALIBRATION_CHAIN_ID_DECIMAL
}

function updateUploadAvailability() {
  const file = elements.uploadFile.files?.[0]
  elements.uploadButton.disabled =
    state.uploading || !file || !state.walletAddress || !isCalibration()
}

function setUploadStatus(message, progress = null) {
  elements.uploadStatus.textContent = message
  if (progress === null) {
    elements.uploadProgress.removeAttribute('value')
  } else {
    elements.uploadProgress.value = Math.max(0, Math.min(100, progress))
  }
}

function clearWalletData(message = 'Connect MetaMask to discover Filecoin data sets.') {
  state.loadVersion += 1
  state.dataSets = []
  state.pieces = []
  state.selectedPiece = null
  state.health = null
  state.deliveries = []
  state.inbox = []

  elements.walletScope.textContent = message
  elements.pieceSelect.disabled = true
  elements.pieceSelect.innerHTML = '<option value="">No wallet data loaded</option>'
  elements.pieceMeta.textContent = '0 data sets | 0 pieces'
  elements.pieceCid.textContent = state.walletAddress ? 'No piece selected' : 'Connect wallet'
  elements.overallHealth.textContent = 'Not checked'
  elements.overallHealth.className = 'status-badge status-unknown'
  elements.lastChecked.textContent = 'Never'
  elements.copyCount.textContent = '0 copies'
  elements.providerRows.innerHTML = `<tr><td colspan="6" class="empty-cell">${escapeHtml(message)}</td></tr>`
  elements.deliveryCount.textContent = '0 events'
  elements.deliveryRows.innerHTML = '<tr><td colspan="6" class="empty-cell">No webhook deliveries for this wallet.</td></tr>'
  elements.payloadView.textContent = 'Select a delivery to inspect its payload.'
  elements.signatureState.textContent = 'No event selected'
  elements.signatureState.className = 'signature-state'
  elements.runCheck.disabled = true
  elements.sendTest.disabled = !state.walletAddress || !isCalibration()
  updateUploadAvailability()
}

function renderWalletButton() {
  elements.switchWallet.hidden = !window.ethereum || !state.walletAddress
  if (!window.ethereum) {
    elements.walletButtonLabel.textContent = 'Install MetaMask'
    elements.networkStatus.classList.add('network-warning')
    return
  }
  if (!state.walletAddress) {
    elements.walletButtonLabel.textContent = 'Connect MetaMask'
    elements.networkStatus.classList.remove('network-warning')
    return
  }
  if (!isCalibration()) {
    elements.walletButtonLabel.textContent = 'Switch to Calibration'
    elements.networkStatus.classList.add('network-warning')
    return
  }
  elements.walletButtonLabel.textContent = shortAddress(state.walletAddress)
  elements.networkStatus.classList.remove('network-warning')
}

function renderPieceSelection(preferredPieceCid) {
  elements.pieceMeta.textContent = `${state.dataSets.length} data sets | ${state.pieces.length} pieces`
  if (state.pieces.length === 0) {
    elements.pieceSelect.disabled = true
    elements.pieceSelect.innerHTML = '<option value="">No active pieces found</option>'
    elements.walletScope.textContent = `${shortAddress(state.walletAddress)} has no active FOC pieces on Calibration.`
    elements.providerRows.innerHTML = '<tr><td colspan="6" class="empty-cell">This wallet has no active Filecoin Onchain Cloud pieces.</td></tr>'
    return
  }

  elements.walletScope.textContent = `Showing only data owned by ${shortAddress(state.walletAddress)} on Calibration.`
  elements.pieceSelect.disabled = false
  elements.pieceSelect.innerHTML = state.pieces.map((piece) =>
    `<option value="${escapeHtml(piece.pieceCid)}">${escapeHtml(shortCid(piece.pieceCid))} | ${piece.copies.length} ${piece.copies.length === 1 ? 'copy' : 'copies'}</option>`
  ).join('')
  const preferred = state.pieces.find((piece) => piece.pieceCid === preferredPieceCid)
  selectPiece(preferred?.pieceCid ?? state.pieces[0].pieceCid)
}

function selectPiece(pieceCid) {
  state.selectedPiece = state.pieces.find((piece) => piece.pieceCid === pieceCid) ?? null
  state.health = null
  elements.pieceCid.textContent = state.selectedPiece?.pieceCid ?? 'No piece selected'
  elements.overallHealth.textContent = 'Not checked'
  elements.overallHealth.className = 'status-badge status-unknown'
  elements.lastChecked.textContent = 'Never'
  elements.copyCount.textContent = `${state.selectedPiece?.copies.length ?? 0} copies`
  elements.runCheck.disabled = !state.selectedPiece || !isCalibration()
  if (!state.selectedPiece) return
  elements.providerRows.innerHTML = state.selectedPiece.copies.map((copy) => `
    <tr>
      <td><div class="provider-cell"><span>${escapeHtml(copy.providerName)}</span><span class="provider-role">#${escapeHtml(copy.providerId)}</span></div></td>
      <td><code>${escapeHtml(copy.dataSetId)}</code></td>
      <td><span class="table-status status-pending">Ready</span></td>
      <td><span class="table-status status-pending">Not checked</span></td>
      <td>-</td>
      <td>-</td>
    </tr>
  `).join('')
}

function renderHealth() {
  if (!state.health) return
  const health = state.health
  elements.overallHealth.textContent = health.state
  elements.overallHealth.className = `status-badge ${statusClass(health.state)}`
  elements.lastChecked.textContent = formatDate(health.checkedAt)
  elements.copyCount.textContent = `${health.copies.length} copies`
  elements.providerRows.innerHTML = health.copies.map((copy) => {
    const source = state.selectedPiece?.copies.find((item) => item.dataSetId === copy.dataSetId)
    return `
      <tr>
        <td><div class="provider-cell"><span>${escapeHtml(source?.providerName ?? `Provider ${copy.providerId}`)}</span><span class="provider-role">#${escapeHtml(copy.providerId)}</span></div></td>
        <td><code>${escapeHtml(copy.dataSetId)}</code></td>
        <td><span class="table-status ${copy.proofOverdue ? 'status-failed' : 'status-success'}">${copy.proofOverdue ? 'Overdue' : 'Current'}</span></td>
        <td><span class="table-status ${copy.retrievalVerified ? 'status-success' : 'status-failed'}">${copy.retrievalVerified ? 'Verified' : 'Failed'}</span></td>
        <td>${copy.retrievalLatencyMs === null ? '-' : `${escapeHtml(copy.retrievalLatencyMs)} ms`}</td>
        <td>${escapeHtml(formatDate(copy.nextProofDueAt))}</td>
      </tr>`
  }).join('')
}

function deliverySignature(eventId) {
  return state.inbox.find((entry) => entry.event?.id === eventId)?.signatureVerified ?? null
}

function renderDeliveries() {
  elements.deliveryCount.textContent = `${state.deliveries.length} events`
  if (state.deliveries.length === 0) {
    elements.deliveryRows.innerHTML = '<tr><td colspan="6" class="empty-cell">No webhook deliveries for this wallet.</td></tr>'
    return
  }
  elements.deliveryRows.innerHTML = state.deliveries.map((record, index) => `
    <tr>
      <td><code>${escapeHtml(record.event.type)}</code></td>
      <td><span class="table-status ${record.result.ok ? 'status-success' : 'status-failed'}">${record.result.ok ? 'Delivered' : 'Failed'}</span></td>
      <td>${record.result.status ?? '-'}</td>
      <td>${record.result.attempts}</td>
      <td>${escapeHtml(formatDate(record.createdAt))}</td>
      <td><button class="row-action" type="button" data-delivery-index="${index}">View</button></td>
    </tr>
  `).join('')
}

function selectDelivery(index) {
  const record = state.deliveries[index]
  if (!record) return
  elements.payloadView.textContent = JSON.stringify(record.event, null, 2)
  const verified = deliverySignature(record.event.id)
  elements.signatureState.textContent = verified === true ? 'HMAC verified' : verified === false ? 'HMAC failed' : 'Receiver not inspected'
  elements.signatureState.className = `signature-state ${verified === true ? 'signature-ok' : verified === false ? 'signature-failed' : ''}`
}

async function refreshLogs() {
  if (!state.walletAddress) return
  const address = state.walletAddress
  const wallet = encodeURIComponent(address)
  const [deliveries, inbox] = await Promise.all([
    request(`/api/deliveries?walletAddress=${wallet}`),
    request(`/demo/inbox?walletAddress=${wallet}`),
  ])
  if (address !== state.walletAddress) return
  state.deliveries = deliveries.deliveries
  state.inbox = inbox.events
  renderDeliveries()
  if (state.deliveries.length > 0) selectDelivery(0)
}

async function loadWalletStorage(preferredPieceCid) {
  if (!state.walletAddress || !isCalibration()) return
  const version = ++state.loadVersion
  const address = state.walletAddress
  elements.walletScope.textContent = `Reading ${shortAddress(address)} from Filecoin Calibration...`
  elements.pieceSelect.innerHTML = '<option value="">Loading onchain pieces...</option>'
  try {
    const storage = await request(`/api/wallet/${encodeURIComponent(address)}/pieces`)
    if (version !== state.loadVersion || address !== state.walletAddress) return
    state.dataSets = storage.dataSets
    state.pieces = storage.pieces
    renderPieceSelection(preferredPieceCid)
    await refreshLogs()
  } catch (error) {
    if (version !== state.loadVersion) return
    clearWalletData(`Could not load this wallet: ${error.message}`)
    showToast(error.message, true)
  }
}

async function uploadToFoc() {
  const file = elements.uploadFile.files?.[0]
  if (!file || !state.walletAddress || !isCalibration() || state.uploading) return
  if (file.size === 0) {
    showToast('Choose a non-empty file', true)
    return
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    showToast('MVP uploads are limited to 50 MB', true)
    return
  }

  const walletAddress = state.walletAddress
  state.uploading = true
  elements.uploadResult.hidden = true
  elements.uploadResult.textContent = ''
  updateUploadAvailability()

  try {
    setUploadStatus('Resolving providers 4 and 2...', 0)
    const synapse = Synapse.create({
      account: getAddress(walletAddress),
      chain: calibration,
      transport: custom(window.ethereum),
      source: 'proofhook',
      withCDN: false,
    })
    const contexts = await synapse.storage.createContexts({
      copies: 2,
      providerIds: UPLOAD_PROVIDER_IDS,
      callbacks: {
        onProviderSelected: (provider) => {
          if (walletAddress === state.walletAddress) {
            setUploadStatus(`Provider ${provider.id.toString()} selected...`, 0)
          }
        },
      },
    })

    setUploadStatus('Checking FOC payment readiness...', 0)
    const prepared = await synapse.storage.prepare({
      context: contexts,
      dataSize: BigInt(file.size),
    })
    if (prepared.transaction) {
      setUploadStatus('Confirm funding and FOC approval in MetaMask...', 0)
      await prepared.transaction.execute({
        onHash: () => setUploadStatus('Funding transaction submitted...', 0),
      })
    }

    setUploadStatus('Uploading to the primary provider...', 1)
    const result = await synapse.storage.upload(file.stream(), {
      contexts,
      pieceMetadata: {
        filename: file.name.slice(0, 160),
        contentType: (file.type || 'application/octet-stream').slice(0, 100),
      },
      callbacks: {
        onProgress: (bytesUploaded) => {
          if (walletAddress !== state.walletAddress) return
          setUploadStatus('Uploading to the primary provider...', Math.round((bytesUploaded / file.size) * 70))
        },
        onStored: () => setUploadStatus('Primary stored. Creating the second copy...', 75),
        onCopyComplete: (providerId) => setUploadStatus(`Provider ${providerId.toString()} copy complete...`, 85),
        onPiecesAdded: () => setUploadStatus('Confirming PieceCID onchain...', 92),
        onPiecesConfirmed: () => setUploadStatus('Onchain confirmation received...', 98),
      },
    })

    if (walletAddress !== state.walletAddress) {
      throw new Error('Wallet changed during upload. Reconnect the original wallet to inspect its PieceCID.')
    }
    const uploadedPieceCid = result.pieceCid.toString()
    elements.uploadResult.hidden = false
    elements.uploadResult.textContent = `${shortCid(uploadedPieceCid)} · ${result.copies.length}/${result.requestedCopies} copies`
    setUploadStatus(
      result.complete ? 'Stored on FOC. Refreshing wallet data...' : 'Upload completed with partial redundancy.',
      100
    )
    await loadWalletStorage(uploadedPieceCid)
    showToast(result.complete ? 'File stored on two FOC providers' : 'File stored with partial redundancy', !result.complete)
  } catch (error) {
    const message = error?.shortMessage ?? error?.message ?? 'FOC upload failed'
    setUploadStatus(message, 0)
    showToast(message, true)
  } finally {
    state.uploading = false
    updateUploadAvailability()
  }
}

async function switchToCalibration() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CALIBRATION_CHAIN_ID }],
    })
  } catch (error) {
    if (error.code !== 4902) throw error
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: CALIBRATION_CHAIN_ID,
        chainName: 'Filecoin - Calibration testnet',
        nativeCurrency: { name: 'Filecoin', symbol: 'tFIL', decimals: 18 },
        rpcUrls: ['https://api.calibration.node.glif.io/rpc/v1'],
        blockExplorerUrls: ['https://filecoin-testnet.blockscout.com'],
      }],
    })
  }
}

async function connectWallet() {
  if (!window.ethereum) {
    window.open('https://metamask.io/download/', '_blank', 'noopener,noreferrer')
    return
  }
  elements.walletButton.disabled = true
  elements.switchWallet.disabled = true
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
    state.walletAddress = accounts[0] ?? null
    state.walletChainId = await window.ethereum.request({ method: 'eth_chainId' })
    clearWalletData(state.walletAddress ? 'Checking Filecoin network...' : 'Connect MetaMask to continue.')
    renderWalletButton()
    if (!isCalibration()) {
      await switchToCalibration()
      state.walletChainId = await window.ethereum.request({ method: 'eth_chainId' })
      renderWalletButton()
    }
    if (state.walletAddress && isCalibration()) await loadWalletStorage()
  } catch (error) {
    showToast(error.message ?? 'MetaMask connection failed', true)
  } finally {
    elements.walletButton.disabled = false
    elements.switchWallet.disabled = false
  }
}

async function chooseAnotherWallet() {
  if (!window.ethereum || !state.walletAddress) return
  const previousAddress = state.walletAddress
  elements.switchWallet.disabled = true
  try {
    await window.ethereum.request({
      method: 'wallet_requestPermissions',
      params: [{ eth_accounts: {} }],
    })
    const accounts = await window.ethereum.request({ method: 'eth_accounts' })
    const nextAddress = accounts[0] ?? null
    const changed = nextAddress?.toLowerCase() !== previousAddress.toLowerCase()

    // MetaMask normally emits accountsChanged. Apply the result here as a fallback
    // for providers that update permissions without emitting the event.
    if (nextAddress?.toLowerCase() !== state.walletAddress?.toLowerCase()) {
      state.walletAddress = nextAddress
      state.walletChainId = await window.ethereum.request({ method: 'eth_chainId' })
      clearWalletData(nextAddress ? 'Wallet changed. Reading its Filecoin data...' : 'MetaMask disconnected.')
      renderWalletButton()
      if (nextAddress && isCalibration()) await loadWalletStorage()
    }
    showToast(changed ? 'Wallet switched' : 'Wallet selection unchanged')
  } catch (error) {
    showToast(error.message ?? 'Could not switch MetaMask wallet', true)
  } finally {
    elements.switchWallet.disabled = false
  }
}

async function runWalletCheck() {
  if (!state.walletAddress || !state.selectedPiece) return
  const walletAddress = state.walletAddress
  const pieceCid = state.selectedPiece.pieceCid
  const original = elements.runCheck.textContent
  elements.runCheck.disabled = true
  elements.runCheck.textContent = 'Checking Filecoin...'
  try {
    const result = await request('/api/wallet/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        walletAddress,
        pieceCid,
      }),
    })
    if (walletAddress !== state.walletAddress || pieceCid !== state.selectedPiece?.pieceCid) return
    state.health = result.health
    renderHealth()
    await refreshLogs()
    showToast('Filecoin health event delivered')
  } catch (error) {
    showToast(error.message, true)
  } finally {
    elements.runCheck.disabled = !state.selectedPiece || !isCalibration()
    elements.runCheck.textContent = original
  }
}

async function sendTestWebhook() {
  if (!state.walletAddress) return
  const walletAddress = state.walletAddress
  const original = elements.sendTest.textContent
  elements.sendTest.disabled = true
  elements.sendTest.textContent = 'Sending...'
  try {
    await request('/api/test-webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ walletAddress }),
    })
    if (walletAddress !== state.walletAddress) return
    await refreshLogs()
    showToast('Test webhook delivered')
  } catch (error) {
    showToast(error.message, true)
  } finally {
    elements.sendTest.disabled = !state.walletAddress || !isCalibration()
    elements.sendTest.textContent = original
  }
}

elements.walletButton.addEventListener('click', async () => {
  if (state.walletAddress && !isCalibration()) {
    try {
      await switchToCalibration()
    } catch (error) {
      showToast(error.message, true)
    }
    return
  }
  await connectWallet()
})
elements.switchWallet.addEventListener('click', chooseAnotherWallet)
elements.pieceSelect.addEventListener('change', () => selectPiece(elements.pieceSelect.value))
elements.runCheck.addEventListener('click', runWalletCheck)
elements.sendTest.addEventListener('click', sendTestWebhook)
elements.uploadFile.addEventListener('change', () => {
  const file = elements.uploadFile.files?.[0]
  elements.uploadResult.hidden = true
  elements.uploadResult.textContent = ''
  setUploadStatus(file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB ready` : 'Choose a file to begin.', 0)
  updateUploadAvailability()
})
elements.uploadButton.addEventListener('click', uploadToFoc)
elements.copyCid.addEventListener('click', async () => {
  if (!state.selectedPiece) return
  await navigator.clipboard.writeText(state.selectedPiece.pieceCid)
  showToast('PieceCID copied')
})
elements.deliveryRows.addEventListener('click', (event) => {
  const button = event.target.closest('[data-delivery-index]')
  if (button) selectDelivery(Number(button.dataset.deliveryIndex))
})

if (window.ethereum) {
  window.ethereum.on('accountsChanged', async (accounts) => {
    state.walletAddress = accounts[0] ?? null
    clearWalletData(state.walletAddress ? 'Wallet changed. Reading its Filecoin data...' : 'MetaMask disconnected.')
    renderWalletButton()
    if (state.walletAddress && isCalibration()) await loadWalletStorage()
  })
  window.ethereum.on('chainChanged', async (chainId) => {
    state.walletChainId = chainId
    clearWalletData(isCalibration() ? 'Network changed. Reading wallet data...' : 'Switch to Filecoin Calibration to load wallet data.')
    renderWalletButton()
    if (state.walletAddress && isCalibration()) await loadWalletStorage()
  })
}

clearWalletData()
renderWalletButton()
