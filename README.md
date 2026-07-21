<p align="center">
  <img src="public/proofhook-mark.svg" width="80" height="80" alt="Proofhook logo" />
</p>

# Proofhook

Proofhook turns wallet-scoped Filecoin Onchain Cloud storage health into signed, retrying HTTP Webhooks.

- Live application: https://proofhook-production.up.railway.app
- Source repository: https://github.com/MikeH1999/proofhook
- Network: Filecoin Calibration
- Runtime wallet key: not required

## Why Proofhook

Applications that depend on Filecoin storage should not need to poll contracts, interpret PDP epochs, discover provider endpoints, download every copy, validate PieceCIDs, and build reliable alert delivery.

Proofhook provides one clear mechanism:

```text
Filecoin storage state -> explainable health result -> signed Webhook
```

The connected MetaMask account is the data boundary. Proofhook discovers that wallet's Filecoin Onchain Cloud data sets and Pieces, checks every provider copy, and emits a normalized event that an ordinary backend can consume.

## Current product

### Wallet-scoped FOC discovery

- Connect or switch MetaMask accounts.
- Switch to Filecoin Calibration when required.
- Discover Warm Storage data sets where the connected wallet is the payer.
- Group the same PieceCID across independent provider copies.
- Clear all prior Piece, health, and delivery state when the account changes.
- Show a real empty state for wallets without FOC storage; never substitute demo data.

### Direct upload to Filecoin Onchain Cloud

- Upload files up to 500 MB from the browser with Synapse SDK.
- Send file bytes directly to FOC providers; Proofhook's backend never receives the file.
- Read the current approved and endorsed provider list.
- Allow up to 10 seconds for Calibration provider health responses.
- Select two distinct reachable providers.
- Use MetaMask for funding, approval, and onchain storage commits.
- Refresh the resulting PieceCID into the connected wallet's storage view.

### Piece health checks

For a selected PieceCID, Proofhook:

1. Rebuilds wallet, data-set, Piece, and provider relationships from public chain state.
2. Rejects a PieceCID that does not belong to the requested wallet.
3. Reads PDP proving state and the next proof deadline for every copy.
4. Retrieves bytes independently from every provider.
5. Validates each retrieval against the expected PieceCID.
6. Records retrieval latency and the provider Retrieval URL.
7. Calculates an explainable health state.
8. Delivers the result as an HMAC-signed Webhook.

Each Provider row exposes an **Open retrieval URL** link so developers can inspect the exact endpoint used by the check.

### Two-copy repair

Proofhook treats fewer than two healthy provider copies as degraded. When a selected Piece is below the target, **Repair to 2 copies** appears beside the PieceCID selector.

Repair does not require the original file:

```text
healthy provider -> approved replacement provider -> onchain commit
```

The replacement provider pulls the existing Piece from a healthy provider. MetaMask still authorizes funding and the onchain commit. Fully unattended paid repair is intentionally outside the MVP.

### Automatic wallet monitoring

- Configure an interval from 1 to 168 hours; the default is 3 hours.
- Sign schedule changes with the same MetaMask wallet.
- Run the first wallet-wide check immediately.
- Check every PieceCID and every provider copy on each interval.
- Persist schedules and grouped run history on Railway.
- Continue routine checks while the browser is closed and the wallet is offline.
- Pause or update the schedule from the UI.

Offline monitoring does not authorize paid repair. Repair still requires a new MetaMask confirmation.

### Signed Webhooks and run history

- Send one health event per PieceCID.
- Sign the exact body with HMAC-SHA256.
- Retry delivery with bounded delays of 0, 2, and 5 seconds.
- Display HTTP status, attempt count, response excerpt, duration, and signature verification.
- Group every scheduled interval by overall state, reason, Piece count, verified-copy count, and Webhook totals.
- Include a built-in HMAC-verified receiver for the public demo.
- Allow caller-supplied Webhook targets only through admin-protected API routes.

## Health policy

| State | Meaning |
| --- | --- |
| `healthy` | At least two copies exist, every copy retrieves and validates, and no known proof is overdue. |
| `degraded` | Fewer than two copies exist, a retrieval failed, or a proof is overdue. |
| `unhealthy` | No provider copy can be retrieved. |
| `unknown` | No copies were found or the available checks were inconclusive. |

A PDP value of `Pending` means the first proof is not yet available; it is not presented as `Current`.

## Filecoin and FOC primitives

Proofhook demonstrates these Filecoin Onchain Cloud building blocks:

- Synapse SDK browser uploads and provider selection.
- PieceCID parsing, retrieval, and byte validation.
- Warm Storage data sets scoped by payer address.
- PDP active Pieces, challenge epochs, proving windows, and deadlines.
- Service Provider Registry IDs and PDP service URLs.
- Independent copies on distinct approved providers.
- Provider-to-provider Piece transfer for repair.
- MetaMask-authorized Filecoin Calibration transactions.
- Public Calibration RPC reads.

## Architecture

```text
Browser
  |-- MetaMask ----------------------> Filecoin Calibration transactions
  |-- Synapse SDK -------------------> FOC provider upload / repair
  |-- Proofhook UI ------------------> wallet-scoped API
                                        |
Proofhook API                            |-- public Calibration RPC reads
  |                                     |-- PDP state inspection
  |                                     |-- provider retrieval + PieceCID validation
  |                                     `-- health normalization
  |
  |-- HMAC-signed delivery ----------> Webhook receiver
  `-- persistent monitor store ------> Railway volume
```

The frontend is a compact static application. Fastify serves the UI and API. Railway runs one service instance with a persistent `/app/data` volume for delivery and monitor state.

## Project evolution

The implementation moved from a narrow receipt demo to a wallet-scoped FOC utility:

1. Replaced local private-key interaction with MetaMask account and network controls.
2. Scoped all displayed storage and delivery data to the connected wallet.
3. Added direct browser-to-FOC uploads with a 500 MB UI limit.
4. Added explicit two-provider selection after Calibration health probes.
5. Added two-copy health policy and wallet-authorized repair without re-upload.
6. Expanded manual checks into persistent N-hour wallet-wide monitoring.
7. Replaced a flat delivery list with grouped interval results and detailed JSON evidence.
8. Added bounded concurrency and Webhook retry behavior to avoid provider and receiver bursts.
9. Added SSRF protection, admin-only custom targets, wallet authorization replay protection, and rate limits.
10. Added provider Retrieval URL links, English date formatting, responsive controls, status explanations, and loading states.
11. Reorganized the UI around the user workflow and added Proofhook and official FOC branding.

## Live Calibration evidence

The public production smoke test uses this real two-copy fixture:

- PieceCID: `bafkzcibd7abqltt56fv3bmluogfje7chexq4teeo6cyiyjz2eb2kcflkpj5uujak`
- Endorsed provider: `4`, data set `19731`
- Approved provider: `2`, data set `19730`
- [Provider 4 commit](https://filecoin-testnet.blockscout.com/tx/0x4e4a6b1f55a448a3534c70f54f562f1d484c8b8cf50bc5c1da8f6d076eafeea9)
- [Provider 2 commit](https://filecoin-testnet.blockscout.com/tx/0xb9e653ab677b012978b703ea4d353b9e2e003082261e2ba675f995aa5cb809ba)

Both copies are independently retrieved and validated against the PieceCID. PDP timing is read from their onchain data sets, and the resulting event is accepted by the signed receiver with HTTP `202`.

## Local development

Requirements:

- Node.js 22 or newer
- MetaMask for wallet UI flows
- A Filecoin Calibration account for upload or repair transactions

Install dependencies and create a local environment file:

```powershell
npm.cmd install
Copy-Item .env.example .env
```

Start the development server:

```powershell
npm.cmd run dev
```

Open `http://127.0.0.1:3000`, connect MetaMask, and select Filecoin Calibration.

The running Web service does not read `FILECOIN_PRIVATE_KEY`. That optional value is used only by the seed and provider-info scripts. Never use a mainnet key or commit `.env`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port; defaults to `3000`. |
| `HOST` | Bind address; defaults to `127.0.0.1`, while the container uses `0.0.0.0`. |
| `PROOFHOOK_WEBHOOK_SECRET` | HMAC secret for outgoing events and the built-in receiver. Use a random production value. |
| `PROOFHOOK_DEMO_WEBHOOK_URL` | Optional legacy demo scheduler target. `auto` uses the current public host for manual demo checks. |
| `PROOFHOOK_PUBLIC_URL` | Public base URL used by persisted wallet schedules outside Railway. |
| `PROOFHOOK_RECEIPT_PATH` | Path to the optional demo receipt. |
| `PROOFHOOK_DELIVERY_LOG_PATH` | Persistent delivery history path. |
| `PROOFHOOK_MONITOR_STATE_PATH` | Persistent wallet schedule and grouped run path. |
| `PROOFHOOK_ALLOW_PRIVATE_WEBHOOK_URLS` | Allow local/private receiver URLs in development; set `false` in production. |
| `PROOFHOOK_SCHEDULE_SECONDS` | Optional legacy receipt scheduler; wallet schedules use their signed hour interval instead. |
| `PROOFHOOK_ADMIN_KEY` | Protects unscoped logs, imported receipts, and custom Webhook targets. |
| `PROOFHOOK_PROVIDER_IDS` | Exactly two provider IDs used by the optional seed script, not normal browser uploads. |
| `FILECOIN_PRIVATE_KEY` | Optional Calibration-only key for seed/info scripts; never used by the Web runtime. |

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm.cmd run dev` | Start the development server with reload. |
| `npm.cmd run verify` | Type-check, run 21 tests, build, and run the high-severity dependency audit. |
| `npm.cmd run verify:live` | Run `verify` plus a real public Calibration Piece check. |
| `npm.cmd run smoke:production` | Exercise the deployed UI, APIs, real Piece health, HMAC receiver, permissions, and rate limits. |
| `npm.cmd run build` | Build the server and bundled browser application. |
| `npm.cmd run start:prod` | Run the compiled production server. |
| `npm.cmd run seed` | Create the optional fixed two-provider fixture; requires `FILECOIN_PRIVATE_KEY`. |
| `npm.cmd run providers:info` | Inspect seed-script providers; requires `FILECOIN_PRIVATE_KEY`. |

## API surface

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | Deployment health check. |
| `GET /api/wallet/:address/datasets` | Read wallet-owned FOC data sets. |
| `GET /api/wallet/:address/pieces` | Read wallet-owned PieceCIDs and provider copies. |
| `POST /api/wallet/check` | Revalidate ownership, check one Piece, and send a signed event. |
| `GET /api/wallet/:address/monitor` | Read the wallet schedule and recent grouped runs. |
| `POST /api/wallet/monitor` | Create, update, pause, or immediately run a wallet-signed schedule. |
| `POST /api/test-webhook` | Send a connectivity-only test event. |
| `GET /api/deliveries` | Read wallet-scoped delivery history; unscoped access requires admin authorization. |
| `GET /demo/inbox` | Inspect the built-in HMAC-verified receiver. |
| `POST /api/check` | Check an imported Synapse receipt and custom target; requires admin authorization. |

## Webhook verification

Proofhook sends these headers:

```text
X-Proofhook-Event-Id
X-Proofhook-Timestamp
X-Proofhook-Signature: v1=<hex digest>
```

The signature covers `timestamp + "." + rawBody`:

```ts
const expected = createHmac('sha256', secret)
  .update(`${timestamp}.${rawBody}`)
  .digest('hex')
```

Event types:

- `piece.health.checked`
- `piece.health.degraded`
- `webhook.test`

`webhook.test` proves connectivity only and is never represented as a Filecoin health event.

## Security boundary

- The Web service has no wallet private key.
- Upload bytes travel directly from the browser to FOC providers.
- Wallet checks rebuild ownership and provider information from public chain state.
- Browser-supplied data-set IDs and Retrieval URLs are not trusted by wallet checks.
- Schedule changes require a fresh signature from the same wallet and reject replay.
- Webhook targets pass protocol, credential, DNS, reserved-network, and private-network checks.
- Custom targets and unscoped operational data require the admin key in production.
- Signed receiver traffic is not throttled during large valid batches; invalid signatures are separately rate-limited.
- Scheduled Piece checks use bounded concurrency to protect RPC endpoints and providers.
- Public reads, health checks, monitor writes, and Webhook writes use separate rate limits.

## Deployment

The repository includes a multi-stage production `Dockerfile` and `railway.json` health-check configuration.

Production requires:

- A random `PROOFHOOK_WEBHOOK_SECRET`.
- `PROOFHOOK_ALLOW_PRIVATE_WEBHOOK_URLS=false`.
- A persistent volume mounted at `/app/data`.
- One service replica while the MVP uses JSON persistence and an in-process scheduler.

Railway supplies `RAILWAY_PUBLIC_DOMAIN` automatically. On another platform, set `PROOFHOOK_PUBLIC_URL` explicitly.

See [docs/deployment.md](docs/deployment.md) for the complete deployment runbook.

## Demo and submission material

- [80-second end-to-end demo](docs/demo-script.md)
- [Four feature-specific 60-90 second video scripts](docs/demo-videos.md)
- [Hackathon submission notes](docs/submission.md)
- [Deployment runbook](docs/deployment.md)

## Brand assets

- [Proofhook mark](public/proofhook-mark.svg): a verified proof node flowing into a Webhook path.
- [Official FOC mark](public/foc-logo.svg): extracted from the public [Filecoin Onchain Cloud documentation](https://docs.filecoin.cloud/).
- [MetaMask fox](public/metamask-fox.svg): displayed only on wallet controls.

Proofhook keeps its product mark separate from the official FOC mark so the interface communicates ecosystem integration without implying that Proofhook is the official Filecoin Cloud application.

## MVP boundaries

- Filecoin Calibration only.
- One built-in signed receiver in the public UI.
- JSON persistence on a single Railway instance.
- At most 25 wallet data sets and 500 active Pieces per data set per query.
- Uploads request two copies, but a partial provider failure can still require manual repair.
- Paid repair requires MetaMask and cannot run unattended while the wallet is offline.
- Mainnet, session-key repair, multi-instance scheduling, payment alerts, and hosted notification channels are outside this hackathon MVP.

## Technology

- TypeScript and Node.js 24 in production
- Fastify 5
- Synapse SDK and `@filoz/synapse-core`
- Viem
- MetaMask
- Filecoin Calibration and PDP
- Railway
