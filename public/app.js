import { Synapse, calibration } from '@filoz/synapse-sdk'
import { getEndorsedProviderIds } from '@filoz/synapse-core/endorsements'
import * as Piece from '@filoz/synapse-core/piece'
import { custom, getAddress, stringToHex } from 'viem'

const CALIBRATION_CHAIN_ID = '0x4cb2f'
const CALIBRATION_CHAIN_ID_DECIMAL = 314159
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024

const state = {
  walletAddress: null,
  walletChainId: null,
  dataSets: [],
  pieces: [],
  selectedPiece: null,
  health: null,
  monitor: null,
  monitorRuns: [],
  loadVersion: 0,
  uploading: false,
  repairing: false,
  checking: false,
  testingWebhook: false,
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
  runCheckLabel: document.querySelector('#run-check-label'),
  checkSpinner: document.querySelector('#check-spinner'),
  sendTest: document.querySelector('#send-test'),
  sendTestLabel: document.querySelector('#send-test-label'),
  testSpinner: document.querySelector('#test-spinner'),
  repairCopy: document.querySelector('#repair-copy'),
  repairCopyLabel: document.querySelector('#repair-copy-label'),
  repairSpinner: document.querySelector('#repair-spinner'),
  repairStatus: document.querySelector('#repair-status'),
  copyCid: document.querySelector('#copy-cid'),
  pieceCid: document.querySelector('#piece-cid'),
  overallHealth: document.querySelector('#overall-health'),
  healthReason: document.querySelector('#health-reason'),
  lastChecked: document.querySelector('#last-checked'),
  copyCount: document.querySelector('#copy-count'),
  providerRows: document.querySelector('#provider-rows'),
  deliveryCount: document.querySelector('#delivery-count'),
  deliveryRows: document.querySelector('#delivery-rows'),
  payloadView: document.querySelector('#payload-view'),
  signatureState: document.querySelector('#signature-state'),
  monitorInterval: document.querySelector('#monitor-interval'),
  monitorSave: document.querySelector('#monitor-save'),
  monitorPause: document.querySelector('#monitor-pause'),
  monitorStatus: document.querySelector('#monitor-status'),
  monitorNextRun: document.querySelector('#monitor-next-run'),
  toast: document.querySelector('#toast'),
  uploadFile: document.querySelector('#upload-file'),
  uploadFileName: document.querySelector('#upload-file-name'),
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

function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function formatCopyCount(count) {
  return `${count} ${count === 1 ? 'copy' : 'copies'}`
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
    state.uploading || state.repairing || !file || !state.walletAddress || !isCalibration()
}

function healthyCopyCount() {
  if (!state.health) return state.selectedPiece?.copies.length ?? 0
  return state.health.copies.filter((copy) =>
    copy.retrievalVerified && copy.proofOverdue !== true
  ).length
}

function updateRepairAvailability() {
  const needsRepair = Boolean(state.selectedPiece && healthyCopyCount() < 2)
  elements.repairCopy.hidden = !needsRepair
  elements.repairCopy.disabled =
    !needsRepair || state.repairing || state.uploading || state.checking || !state.walletAddress || !isCalibration()
}

function setActionBusy(button, label, spinner, busy, idleText, busyText) {
  button.setAttribute('aria-busy', String(busy))
  label.textContent = busy ? busyText : idleText
  spinner.hidden = !busy
}

function setRepairBusy(busy) {
  elements.repairCopy.setAttribute('aria-busy', String(busy))
  elements.repairCopyLabel.textContent = busy ? 'Repairing...' : 'Repair to 2 copies'
  elements.repairSpinner.hidden = !busy
}

function setRepairProgress(message = '') {
  elements.repairStatus.textContent = message
  elements.repairStatus.hidden = message.length === 0
}

function describePieceHealth(health) {
  const copies = health?.copies ?? []
  const verified = copies.filter((copy) => copy.retrievalVerified).length
  const failedRetrievals = copies.length - verified
  const overdueProofs = copies.filter((copy) => copy.proofOverdue === true).length

  if (health?.state === 'healthy') {
    return `${copies.length} provider copies retrieve successfully; no known proof is overdue.`
  }
  if (health?.state === 'degraded') {
    if (copies.length < 2) {
      return `Only ${copies.length} provider ${copies.length === 1 ? 'copy exists' : 'copies exist'}; at least 2 are required.`
    }
    if (overdueProofs > 0) {
      return `${overdueProofs} provider ${overdueProofs === 1 ? 'proof is' : 'proofs are'} overdue.`
    }
    if (failedRetrievals > 0) {
      return `${failedRetrievals} of ${copies.length} provider copies failed retrieval verification.`
    }
    return 'One or more copies failed the redundancy, retrieval, or proof policy.'
  }
  if (health?.state === 'unhealthy') {
    return `None of the ${copies.length} provider copies passed retrieval verification.`
  }
  return copies.length === 0
    ? 'No provider copies were found for this PieceCID.'
    : 'The available provider checks were inconclusive.'
}

function describeMonitorRun(run) {
  const results = run.results ?? []
  const underReplicated = results.filter((result) => result.copyCount < 2).length
  const unhealthy = results.filter((result) => result.state === 'unhealthy').length
  const degraded = results.filter((result) => result.state === 'degraded').length
  const unknown = results.filter((result) => result.state === 'unknown').length

  if (run.error) return 'The wallet-wide run could not complete.'
  if (unhealthy > 0) return `${unhealthy} PieceCID${unhealthy === 1 ? '' : 's'} had no retrievable copy.`
  if (underReplicated > 0) {
    return `${underReplicated} PieceCID${underReplicated === 1 ? '' : 's'} below the 2-copy target.`
  }
  if (degraded > 0) return `${degraded} PieceCID${degraded === 1 ? '' : 's'} failed retrieval or proof policy.`
  if (unknown > 0) return `${unknown} PieceCID${unknown === 1 ? '' : 's'} produced inconclusive checks.`
  return 'Every PieceCID meets the copy, retrieval, and proof policy.'
}

function setUploadStatus(message, progress = null) {
  elements.uploadStatus.textContent = message
  if (progress === null) {
    elements.uploadProgress.removeAttribute('value')
  } else {
    elements.uploadProgress.value = Math.max(0, Math.min(100, progress))
  }
}

function updateMonitorAvailability() {
  const ready = Boolean(state.walletAddress && isCalibration())
  elements.monitorInterval.disabled = !ready
  elements.monitorSave.disabled = !ready
  elements.monitorPause.disabled = !ready
  elements.monitorPause.hidden = !state.monitor?.enabled
  elements.sendTest.disabled = !ready || state.testingWebhook
}

function clearWalletData(message = 'Connect MetaMask to discover Filecoin data sets.') {
  state.loadVersion += 1
  state.dataSets = []
  state.pieces = []
  state.selectedPiece = null
  state.health = null
  state.monitor = null
  state.monitorRuns = []

  elements.walletScope.textContent = message
  elements.pieceSelect.disabled = true
  elements.pieceSelect.innerHTML = '<option value="">No wallet data loaded</option>'
  elements.pieceMeta.textContent = '0 data sets | 0 pieces'
  elements.pieceCid.textContent = state.walletAddress ? 'No piece selected' : 'Connect wallet'
  elements.copyCid.disabled = true
  elements.overallHealth.textContent = 'Not checked'
  elements.overallHealth.className = 'status-badge status-unknown'
  elements.healthReason.textContent = 'Run a check to explain this PieceCID\'s status.'
  elements.lastChecked.textContent = 'Never'
  elements.copyCount.textContent = formatCopyCount(0)
  elements.providerRows.innerHTML = `<tr><td colspan="6" class="empty-cell">${escapeHtml(message)}</td></tr>`
  elements.deliveryCount.textContent = '0 runs'
  elements.deliveryRows.innerHTML = '<tr><td colspan="8" class="empty-cell">No scheduled health runs for this wallet.</td></tr>'
  elements.payloadView.textContent = 'Select a scheduled run to inspect every PieceCID and provider copy.'
  elements.signatureState.textContent = 'No run selected'
  elements.signatureState.className = 'signature-state'
  elements.monitorInterval.value = '3'
  elements.monitorStatus.textContent = state.walletAddress ? 'No schedule configured.' : 'Connect MetaMask to configure automatic checks.'
  elements.monitorNextRun.textContent = 'Not scheduled'
  elements.runCheck.disabled = true
  updateRepairAvailability()
  updateUploadAvailability()
  updateMonitorAvailability()
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
  elements.copyCid.disabled = !state.selectedPiece
  elements.overallHealth.textContent = 'Not checked'
  elements.overallHealth.className = 'status-badge status-unknown'
  elements.healthReason.textContent = state.selectedPiece
    ? 'Run a check to explain this PieceCID\'s status.'
    : 'Select a PieceCID to inspect its health.'
  elements.lastChecked.textContent = 'Never'
  elements.copyCount.textContent = formatCopyCount(state.selectedPiece?.copies.length ?? 0)
  elements.runCheck.disabled =
    !state.selectedPiece || state.checking || state.repairing || !isCalibration()
  updateRepairAvailability()
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
  elements.healthReason.textContent = describePieceHealth(health)
  elements.lastChecked.textContent = formatDate(health.checkedAt)
  elements.copyCount.textContent = formatCopyCount(health.copies.length)
  elements.providerRows.innerHTML = health.copies.map((copy) => {
    const source = state.selectedPiece?.copies.find((item) => item.dataSetId === copy.dataSetId)
    const proofStatus = copy.proofOverdue === null
      ? { className: 'status-pending', label: 'Pending' }
      : copy.proofOverdue
        ? { className: 'status-failed', label: 'Overdue' }
        : { className: 'status-success', label: 'Current' }
    return `
      <tr>
        <td><div class="provider-cell"><span>${escapeHtml(source?.providerName ?? `Provider ${copy.providerId}`)}</span><span class="provider-role">#${escapeHtml(copy.providerId)}</span></div></td>
        <td><code>${escapeHtml(copy.dataSetId)}</code></td>
        <td><span class="table-status ${proofStatus.className}">${proofStatus.label}</span></td>
        <td><span class="table-status ${copy.retrievalVerified ? 'status-success' : 'status-failed'}">${copy.retrievalVerified ? 'Verified' : 'Failed'}</span></td>
        <td>${copy.retrievalLatencyMs === null ? '-' : `${escapeHtml(copy.retrievalLatencyMs)} ms`}</td>
        <td>${escapeHtml(formatDate(copy.nextProofDueAt))}</td>
      </tr>`
  }).join('')
  updateRepairAvailability()
}

function renderMonitor() {
  if (!state.monitor) {
    elements.monitorStatus.textContent = 'No schedule configured. Default interval: 3 hours.'
    elements.monitorNextRun.textContent = 'Not scheduled'
    elements.monitorInterval.value = '3'
  } else {
    elements.monitorInterval.value = String(state.monitor.intervalHours)
    elements.monitorStatus.textContent = state.monitor.enabled
      ? `Enabled · every ${state.monitor.intervalHours} ${state.monitor.intervalHours === 1 ? 'hour' : 'hours'} · runs on Railway while the wallet is offline`
      : 'Paused'
    elements.monitorNextRun.textContent = state.monitor.nextRunAt
      ? formatDate(state.monitor.nextRunAt)
      : 'Not scheduled'
  }
  elements.monitorSave.textContent = state.monitor
    ? 'Update schedule & run now'
    : 'Enable monitoring & run now'
  updateMonitorAvailability()
}

function renderMonitorRuns() {
  elements.deliveryCount.textContent = `${state.monitorRuns.length} ${state.monitorRuns.length === 1 ? 'run' : 'runs'}`
  if (state.monitorRuns.length === 0) {
    elements.deliveryRows.innerHTML = '<tr><td colspan="8" class="empty-cell">No scheduled health runs for this wallet.</td></tr>'
    return
  }
  elements.deliveryRows.innerHTML = state.monitorRuns.map((run, index) => {
    const reason = describeMonitorRun(run)
    return `
      <tr>
        <td>${escapeHtml(formatDate(run.completedAt))}</td>
        <td><span class="table-status ${statusClass(run.state)}" title="${escapeHtml(reason)}">${escapeHtml(run.state)}</span></td>
        <td class="run-reason">${escapeHtml(reason)}</td>
        <td>${run.pieceCount}</td>
        <td>${run.healthyCopyCount}/${run.copyCount}</td>
        <td>${run.webhooksDelivered}/${run.webhooksTotal}</td>
        <td>${run.intervalHours}h</td>
        <td><button class="row-action" type="button" data-run-index="${index}">View</button></td>
      </tr>
    `
  }).join('')
}

function selectMonitorRun(index) {
  const run = state.monitorRuns[index]
  if (!run) return
  elements.payloadView.textContent = JSON.stringify(run, null, 2)
  const delivered = run.webhooksTotal > 0 && run.webhooksDelivered === run.webhooksTotal
  elements.signatureState.textContent = delivered ? 'All webhooks accepted' : `${run.webhooksDelivered}/${run.webhooksTotal} webhooks accepted`
  elements.signatureState.className = `signature-state ${delivered ? 'signature-ok' : 'signature-failed'}`
}

async function refreshMonitor() {
  if (!state.walletAddress) return
  const address = state.walletAddress
  const response = await request(`/api/wallet/${encodeURIComponent(address)}/monitor`)
  if (address !== state.walletAddress) return
  state.monitor = response.monitor
  state.monitorRuns = response.runs
  renderMonitor()
  renderMonitorRuns()
  if (state.monitorRuns.length > 0) selectMonitorRun(0)
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
    await refreshMonitor()
  } catch (error) {
    if (version !== state.loadVersion) return
    clearWalletData(`Could not load this wallet: ${error.message}`)
    showToast(error.message, true)
  }
}

function monitorAuthorizationMessage(walletAddress, intervalHours, enabled, runNow, issuedAt) {
  return [
    'Proofhook scheduled monitor',
    `Wallet: ${getAddress(walletAddress)}`,
    `Interval hours: ${intervalHours}`,
    `Enabled: ${enabled ? 'yes' : 'no'}`,
    `Run now: ${runNow ? 'yes' : 'no'}`,
    `Issued at: ${issuedAt}`,
  ].join('\n')
}

async function saveMonitor(enabled, runNow) {
  if (!state.walletAddress || !isCalibration()) return
  const intervalHours = Number(elements.monitorInterval.value || 3)
  if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 168) {
    showToast('Interval must be a whole number from 1 to 168 hours', true)
    return
  }
  const walletAddress = state.walletAddress
  const issuedAt = new Date().toISOString()
  const message = monitorAuthorizationMessage(walletAddress, intervalHours, enabled, runNow, issuedAt)
  const original = elements.monitorSave.textContent
  elements.monitorSave.disabled = true
  elements.monitorPause.disabled = true
  elements.monitorStatus.textContent = enabled && runNow
    ? 'Confirm in MetaMask, then checking every PieceCID and copy...'
    : 'Confirm this schedule change in MetaMask...'
  try {
    const signature = await window.ethereum.request({
      method: 'personal_sign',
      params: [stringToHex(message), walletAddress],
    })
    await request('/api/wallet/monitor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ walletAddress, intervalHours, enabled, runNow, issuedAt, signature }),
    })
    if (walletAddress !== state.walletAddress) return
    await refreshMonitor()
    showToast(enabled ? `Automatic checks set to every ${intervalHours}h` : 'Automatic checks paused')
  } catch (error) {
    showToast(error.message ?? 'Could not update automatic checks', true)
    await refreshMonitor().catch(() => {})
  } finally {
    elements.monitorSave.textContent = original
    updateMonitorAvailability()
  }
}

async function findReachableApprovedProviders(synapse, excludedProviderIds, onStatus) {
  onStatus('Reading chain-approved providers...')
  const [storageInfo, endorsedProviderIds] = await Promise.all([
    synapse.storage.getStorageInfo(),
    getEndorsedProviderIds(synapse.client),
  ])
  const excluded = new Set(excludedProviderIds.map(String))
  const endorsed = new Set(endorsedProviderIds.map(String))
  const copyCounts = new Map()
  for (const storedPiece of state.pieces) {
    for (const copy of storedPiece.copies) {
      copyCounts.set(copy.providerId, (copyCounts.get(copy.providerId) ?? 0) + 1)
    }
  }

  const candidates = storageInfo.providers
    .filter((provider) => !excluded.has(provider.id.toString()))
    .sort((left, right) => {
      const endorsementDifference =
        Number(endorsed.has(right.id.toString())) - Number(endorsed.has(left.id.toString()))
      if (endorsementDifference !== 0) return endorsementDifference
      return (copyCounts.get(right.id.toString()) ?? 0) - (copyCounts.get(left.id.toString()) ?? 0)
    })

  onStatus('Checking approved providers (up to 10 seconds)...')
  const checks = await Promise.all(candidates.map(async (provider) => {
    try {
      const response = await fetch(new URL('pdp/ping', provider.pdp.serviceURL), {
        signal: AbortSignal.timeout(10_000),
      })
      return { provider, available: response.ok }
    } catch {
      return { provider, available: false }
    }
  }))
  return checks.filter((check) => check.available).map((check) => check.provider)
}

async function uploadToFoc() {
  const file = elements.uploadFile.files?.[0]
  if (!file || !state.walletAddress || !isCalibration() || state.uploading) return
  if (file.size === 0) {
    showToast('Choose a non-empty file', true)
    return
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    showToast('Uploads are limited to 500 MB', true)
    return
  }

  const walletAddress = state.walletAddress
  state.uploading = true
  elements.uploadResult.hidden = true
  elements.uploadResult.textContent = ''
  updateUploadAvailability()

  try {
    const synapse = Synapse.create({
      account: getAddress(walletAddress),
      chain: calibration,
      transport: custom(window.ethereum),
      source: 'proofhook',
      withCDN: false,
    })
    const approvedProviders = await findReachableApprovedProviders(
      synapse,
      [],
      (message) => setUploadStatus(message, 0)
    )
    if (approvedProviders.length < 2) {
      throw new Error(`Only ${approvedProviders.length} approved provider${approvedProviders.length === 1 ? '' : 's'} responded within 10 seconds; 2 are required.`)
    }
    const providerIds = approvedProviders.slice(0, 2).map((provider) => provider.id)
    const contexts = await synapse.storage.createContexts({
      copies: 2,
      providerIds,
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
    elements.uploadResult.textContent = `${shortCid(uploadedPieceCid)} | ${result.copies.length}/${result.requestedCopies} copies`
    setUploadStatus(
      result.complete ? 'Stored 2/2 copies. Refreshing wallet data...' : `Stored ${result.copies.length}/2 copies. Repair required.`,
      100
    )
    await loadWalletStorage(uploadedPieceCid)
    showToast(result.complete ? 'File stored on two FOC providers' : `Stored ${result.copies.length}/2 copies. Repair required.`, !result.complete)
  } catch (error) {
    const message = error?.shortMessage ?? error?.message ?? 'FOC upload failed'
    setUploadStatus(message, 0)
    showToast(message, true)
  } finally {
    state.uploading = false
    updateUploadAvailability()
    updateRepairAvailability()
  }
}

async function resolveRepairTarget(synapse, excludedProviderIds, walletAddress) {
  const candidates = await findReachableApprovedProviders(
    synapse,
    excludedProviderIds,
    setRepairProgress
  )

  if (candidates.length === 0) {
    throw new Error('No distinct chain-approved provider responded within 10 seconds. Retry when Calibration providers are available.')
  }

  let lastError = null
  for (const provider of candidates) {
    try {
      if (walletAddress === state.walletAddress) {
        setRepairProgress(`Preparing provider ${provider.id.toString()}...`)
      }
      const context = await synapse.storage.createContext({ providerId: provider.id })
      return { context, providerId: provider.id }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError ?? new Error('No approved provider could create a repair context.')
}

async function repairToTwoCopies() {
  if (
    !state.walletAddress || !state.selectedPiece || !isCalibration() ||
    state.repairing || healthyCopyCount() >= 2
  ) return

  const walletAddress = state.walletAddress
  const pieceCidString = state.selectedPiece.pieceCid
  const selectedPiece = state.selectedPiece
  state.repairing = true
  setRepairBusy(true)
  setRepairProgress('Preparing repair...')
  elements.runCheck.disabled = true
  updateUploadAvailability()
  updateRepairAvailability()

  try {
    const piece = Piece.from(pieceCidString)
    const healthySource = state.health?.copies.find((copy) =>
      copy.retrievalVerified && copy.proofOverdue !== true
    ) ?? state.health?.copies.find((copy) => copy.retrievalVerified)
    const sourceCopy = selectedPiece.copies.find((copy) =>
      copy.dataSetId === healthySource?.dataSetId
    ) ?? selectedPiece.copies[0]

    if (!sourceCopy) throw new Error('No existing provider copy is available as the repair source.')

    const synapse = Synapse.create({
      account: getAddress(walletAddress),
      chain: calibration,
      transport: custom(window.ethereum),
      source: 'proofhook',
      withCDN: false,
    })
    const sourceContext = await synapse.storage.createContext({
      dataSetId: BigInt(sourceCopy.dataSetId),
    })
    const excludedProviderIds = selectedPiece.copies.map((copy) => BigInt(copy.providerId))
    const { context: targetContext, providerId: targetProviderId } = await resolveRepairTarget(
      synapse,
      excludedProviderIds,
      walletAddress
    )

    if (walletAddress !== state.walletAddress || pieceCidString !== state.selectedPiece?.pieceCid) {
      throw new Error('Wallet or PieceCID changed during repair. Return to the original selection and retry.')
    }

    const prepared = await synapse.storage.prepare({
      context: targetContext,
      dataSize: BigInt(piece.size),
    })
    if (prepared.transaction) {
      setRepairProgress('Confirm funding and FOC approval in MetaMask...')
      await prepared.transaction.execute({
        onHash: () => { setRepairProgress('Funding submitted. Waiting for confirmation...') },
      })
    }

    const pieceInput = {
      pieceCid: piece,
      pieceMetadata: { repairedBy: 'proofhook' },
    }
    setRepairProgress('Sign the repair authorization in MetaMask...')
    const extraData = await targetContext.presignForCommit([pieceInput])
    setRepairProgress(`Provider ${targetProviderId.toString()} is pulling the existing PieceCID...`)
    const pullResult = await targetContext.pull({
      pieces: [piece],
      from: (cid) => sourceContext.getPieceUrl(cid),
      extraData,
    })
    if (pullResult.status !== 'complete') {
      throw new Error('The new provider could not pull the PieceCID from the existing copy.')
    }

    setRepairProgress('Commit the second copy onchain...')
    const commitResult = await targetContext.commit({
      pieces: [pieceInput],
      extraData,
      onSubmitted: () => { setRepairProgress('Transaction submitted. Confirming the second copy onchain...') },
    })

    if (walletAddress !== state.walletAddress) {
      throw new Error('Wallet changed during repair. Reconnect the original wallet to inspect the new copy.')
    }

    await loadWalletStorage(pieceCidString)
    await runWalletCheck({ allowDuringRepair: true })
    showToast(`Second copy committed on provider ${targetProviderId?.toString() ?? 'new'} (data set ${commitResult.dataSetId.toString()})`)
  } catch (error) {
    const message = error?.shortMessage ?? error?.message ?? 'Could not repair this PieceCID'
    showToast(message, true)
  } finally {
    state.repairing = false
    setRepairBusy(false)
    setRepairProgress()
    elements.runCheck.disabled = !state.selectedPiece || !isCalibration()
    updateUploadAvailability()
    updateRepairAvailability()
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

async function runWalletCheck(options = {}) {
  if (
    !state.walletAddress || !state.selectedPiece || state.checking ||
    (state.repairing && options.allowDuringRepair !== true)
  ) return
  const walletAddress = state.walletAddress
  const pieceCid = state.selectedPiece.pieceCid
  state.checking = true
  elements.runCheck.disabled = true
  setActionBusy(
    elements.runCheck,
    elements.runCheckLabel,
    elements.checkSpinner,
    true,
    'Check health',
    'Checking...'
  )
  updateRepairAvailability()
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
    await refreshMonitor()
    showToast('Filecoin health event delivered')
  } catch (error) {
    showToast(error.message, true)
  } finally {
    state.checking = false
    setActionBusy(
      elements.runCheck,
      elements.runCheckLabel,
      elements.checkSpinner,
      false,
      'Check health',
      'Checking...'
    )
    elements.runCheck.disabled = !state.selectedPiece || state.repairing || !isCalibration()
    updateRepairAvailability()
  }
}

async function sendTestWebhook() {
  if (!state.walletAddress || state.testingWebhook) return
  const walletAddress = state.walletAddress
  state.testingWebhook = true
  elements.sendTest.disabled = true
  setActionBusy(
    elements.sendTest,
    elements.sendTestLabel,
    elements.testSpinner,
    true,
    'Test webhook',
    'Sending...'
  )
  try {
    await request('/api/test-webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ walletAddress }),
    })
    if (walletAddress !== state.walletAddress) return
    showToast('Test webhook delivered')
  } catch (error) {
    showToast(error.message, true)
  } finally {
    state.testingWebhook = false
    setActionBusy(
      elements.sendTest,
      elements.sendTestLabel,
      elements.testSpinner,
      false,
      'Test webhook',
      'Sending...'
    )
    updateMonitorAvailability()
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
elements.repairCopy.addEventListener('click', repairToTwoCopies)
elements.uploadFile.addEventListener('change', () => {
  const file = elements.uploadFile.files?.[0]
  elements.uploadFileName.textContent = file ? file.name : 'No file selected'
  elements.uploadResult.hidden = true
  elements.uploadResult.textContent = ''
  setUploadStatus(file ? `${file.name} | ${formatFileSize(file.size)} ready` : 'Choose a file to begin.', 0)
  updateUploadAvailability()
})
elements.uploadButton.addEventListener('click', uploadToFoc)
elements.monitorSave.addEventListener('click', () => saveMonitor(true, true))
elements.monitorPause.addEventListener('click', () => saveMonitor(false, false))
elements.monitorInterval.addEventListener('input', updateMonitorAvailability)
elements.copyCid.addEventListener('click', async () => {
  if (!state.selectedPiece) return
  await navigator.clipboard.writeText(state.selectedPiece.pieceCid)
  showToast('PieceCID copied')
})
elements.deliveryRows.addEventListener('click', (event) => {
  const button = event.target.closest('[data-run-index]')
  if (button) selectMonitorRun(Number(button.dataset.runIndex))
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
