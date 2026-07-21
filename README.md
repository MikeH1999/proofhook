# Proofhook

Proofhook turns Filecoin Onchain Cloud health into signed HTTP webhooks.

- Live demo: https://proofhook-production.up.railway.app
- Source: https://github.com/MikeH1999/proofhook
- The FOC mark is the official logo served by https://docs.filecoin.cloud/ and is stored locally as `public/foc-logo.svg`.

The MVP connects MetaMask, uploads a file directly from the browser to two FOC providers, and discovers the connected wallet's FOC data sets on Calibration. A wallet-signed schedule (3 hours by default) then checks every PieceCID and every provider copy, groups each run in the UI, and delivers normalized HMAC-signed events.

## MVP event types

- `piece.health.checked`: a real Filecoin health check completed.
- `piece.health.degraded`: one or more health requirements failed.
- `webhook.test`: connectivity test only; never presented as a Filecoin event.

## Live Calibration fixture

- PieceCID: `bafkzcibd7abqltt56fv3bmluogfje7chexq4teeo6cyiyjz2eb2kcflkpj5uujak`
- Endorsed primary: provider `4`, data set `19731`
- Approved secondary: provider `2`, data set `19730`
- Primary commit: [0x4e4a…feea9](https://filecoin-testnet.blockscout.com/tx/0x4e4a6b1f55a448a3534c70f54f562f1d484c8b8cf50bc5c1da8f6d076eafeea9)
- Secondary commit: [0xb9e6…809ba](https://filecoin-testnet.blockscout.com/tx/0xb9e653ab677b012978b703ea4d353b9e2e003082261e2ba675f995aa5cb809ba)

Both copies have been independently retrieved and validated against the PieceCID through Synapse SDK. PDP proof timing is read from the corresponding on-chain data sets.

## Wallet flow

```text
MetaMask account
  -> switch to Filecoin Calibration
  -> optionally upload a file to two independently selected providers with Synapse SDK
  -> allow up to 10 seconds for approved-provider health checks and select two targets
  -> fund/approve FOC through MetaMask when required
  -> commit the new PieceCID onchain under the connected payer
  -> query data sets where the wallet is the payer
  -> sign an automatic interval (default 3 hours)
  -> check every wallet PieceCID and every provider copy per run
  -> group the run result with Piece/copy/Webhook totals
  -> select one of that wallet's active PieceCIDs
  -> revalidate wallet ownership on the server
  -> read PDP status for every matching data set
  -> retrieve from every provider
  -> validate bytes against PieceCID
  -> normalize health
  -> sign event with HMAC-SHA256
  -> deliver HTTP webhook
  -> persist delivery result
```

## Local setup

Requirements: Node.js 22 or newer and MetaMask. The connected account only needs Calibration storage data; the browser never sends a private key to Proofhook.

```bash
npm install
cp .env.example .env
```

Run the deterministic submission checks with `npm run verify`. Add a real Calibration PDP/retrieval check with `npm run verify:live`.

Start the local API and signed demo receiver:

```bash
npm run dev
```

Open `http://127.0.0.1:3000/`, connect MetaMask, and switch to Calibration. Use **Upload to FOC** to request two independently selected provider copies. Proofhook reads the current chain-approved list and allows up to 10 seconds for provider health responses before explicitly selecting two targets, avoiding false negatives from the SDK's shorter Calibration ping. MetaMask signs any required funding/approval and onchain commit actions. The resulting PieceCID is refreshed into the same wallet's monitor. The hackathon UI limits a selected file to 500 MB.

You can also select any Piece already owned by the connected wallet. Use **Switch wallet** to reopen MetaMask's account picker; account changes clear all prior wallet data. Wallets without FOC data show an empty state and never fall back to the bundled demo receipt. File bytes are sent to the selected FOC provider, not to the Proofhook backend.

Select a PieceCID under **Your FOC storage**, then use **Check health** to run an immediate PDP, retrieval, PieceCID validation, and signed Webhook flow. The selected Piece's health summary and Provider-copy table stay directly below that control, with an **Open retrieval URL** link for every provider copy. Use **Repair to 2 copies** when the selected Piece is below the redundancy target.

Under **Check every copy automatically**, choose a whole-number interval from 1 to 168 hours (default `3`) and click **Enable monitoring & run now**. MetaMask signs the schedule without exposing a private key. The first all-copy run happens immediately; later runs execute on Railway even when the browser is closed and the wallet is offline. **Health run groups** shows one row per interval with aggregate state, the specific reason for that state, Piece count, verified-copy count, and Webhook delivery count. Use **Pause monitoring** to stop future runs or **Test webhook** to verify the built-in HMAC receiver.

Proofhook treats fewer than two provider copies as `degraded`. If an upload or later health check leaves fewer than two healthy copies, select the PieceCID and use **Repair to 2 copies** beside the PieceCID selector. Proofhook reads the current chain-approved Provider list, allows up to 10 seconds for Calibration health responses, and explicitly selects a distinct reachable Provider. That provider pulls the existing Piece directly from a healthy provider and commits it onchain; the original file does not need to be selected again. This repair requires MetaMask authorization. Fully unattended paid repair while the wallet is offline would require a separately scoped session key and is outside this MVP.

The runtime uses public Calibration RPC reads and does not read `FILECOIN_PRIVATE_KEY`.

### Optional demo fixture

Only the seed and wallet/provider info scripts use `FILECOIN_PRIVATE_KEY`. Never use a mainnet wallet or commit `.env`.

The seed script's fixed demo fixture explicitly selects Calibration providers `4,2`. Browser uploads do not use this fixed pair; they probe the current chain-approved list and explicitly select two responsive, independent providers.

Create the two-provider demo fixture:

```bash
npm run seed
```

Check its PDP and retrieval health:

```bash
npm run check:piece
```

Then send a connectivity event:

```bash
curl -X POST http://127.0.0.1:3000/api/test-webhook \
  -H "content-type: application/json" \
  -d "{}"
```

Run the real Filecoin check and deliver it to the demo receiver:

```bash
curl -X POST http://127.0.0.1:3000/api/check-demo \
  -H "content-type: application/json" \
  -d "{}"
```

Inspect received events at `GET /demo/inbox`.

## Webhook verification

Proofhook sends:

```text
X-Proofhook-Event-Id
X-Proofhook-Timestamp
X-Proofhook-Signature: v1=<hex digest>
```

Verify the signature over the exact request bytes:

```ts
const expected = createHmac('sha256', secret)
  .update(`${timestamp}.${rawBody}`)
  .digest('hex')
```

## Deployment

The verified public deployment is available at `https://proofhook-production.up.railway.app`.

The repository includes a production Dockerfile and Railway configuration. Set:

```text
PROOFHOOK_WEBHOOK_SECRET=<random secret>
PROOFHOOK_DEMO_WEBHOOK_URL=auto
PROOFHOOK_ALLOW_PRIVATE_WEBHOOK_URLS=false
PROOFHOOK_PROVIDER_IDS=4,2
PROOFHOOK_SCHEDULE_SECONDS=0
PROOFHOOK_RECEIPT_PATH=/app/fixtures/demo-receipt.json
PROOFHOOK_DELIVERY_LOG_PATH=/app/data/delivery-log.json
PROOFHOOK_ADMIN_KEY=<optional key for POST /api/check>
```

No private key or pre-known deployment domain is required. Manual checks derive the signed demo receiver URL from the current public request. If the optional scheduler is enabled, set `PROOFHOOK_DEMO_WEBHOOK_URL=https://<deployment-domain>/demo/receiver` explicitly. The public Calibration receipt is included in `fixtures/demo-receipt.json` for that scheduler/demo endpoint. Mount a persistent Railway volume at `/app/data` for delivery history. Keep the service at one replica while the MVP uses its in-process scheduler.

See `docs/deployment.md` for the complete GitHub and Railway runbook.

See `docs/demo-videos.md` for four 60–90 second feature-specific demo scripts covering wallet health checks, FOC upload and repair, scheduled Webhooks, and wallet/provider debugging.

## Checking an imported Synapse receipt

`POST /api/check` accepts a Synapse upload receipt, a webhook URL, and a caller-defined subscription ID. Proofhook reads the public PDP state and validates the declared provider retrieval URLs; the monitored data set does not need to be owned by the Proofhook service wallet.

```json
{
  "subscriptionId": "release-artifacts",
  "webhookUrl": "https://example.com/filecoin-events",
  "receipt": {
    "chain": "calibration",
    "pieceCid": "bafkzcib...",
    "size": 512,
    "createdAt": "2026-07-16T13:25:34.261Z",
    "transactionHashes": [],
    "copies": [
      {
        "providerId": "4",
        "dataSetId": "19731",
        "pieceId": "0",
        "retrievalUrl": "https://provider.example/piece/bafkzcib...",
        "role": "primary"
      }
    ]
  }
}
```

## Current scope

- Calibration only.
- MetaMask account and network detection.
- Wallet-owned FOC data set and Piece discovery through public chain reads.
- Manual health checks and a built-in signed receiver.
- No mainnet support, payment alerts, or third-party notification channels yet.

## Security boundary

The web service has no wallet key. A wallet check rebuilds provider and retrieval information from the connected address's onchain data sets; it does not trust browser-supplied data set IDs or provider URLs. Webhook requests are signed over `timestamp + "." + rawBody` with HMAC-SHA256. Valid signed receiver traffic is not throttled during large scheduled runs; invalid signatures remain IP-rate-limited. Scheduled Piece checks use bounded concurrency to protect RPC and providers. Public RPC/retrieval routes are rate-limited. Unscoped delivery history and caller-supplied webhook targets require the admin key when configured. Webhook URLs also pass HTTPS, credential, DNS, reserved-network, and private-network checks.
