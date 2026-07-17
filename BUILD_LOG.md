# Proofhook AI Build Log

This log records how AI was used to plan, implement, debug, and verify the Proofhook MVP.

## 1. Scope and architecture

The initial brainstorm considered agent-facing products, then deliberately removed the agent framing and focused on a Filecoin developer adapter. The selected mechanism was:

```text
Filecoin state -> normalized signed HTTP webhook
```

The MVP was frozen to Calibration, Synapse upload receipts, PDP timing, verified retrieval, HMAC delivery, limited retry, and a single-instance scheduler. Wallet UI, mainnet, payment alerts, and third-party notification channels were deferred.

## 2. Filecoin-first implementation

The first code was a set of vertical-slice scripts rather than a frontend:

1. Derive the Calibration address and inspect tFIL/tUSDFC balances.
2. Call `storage.prepare()`.
3. Upload a stable 512-byte fixture with two providers.
4. Save the resulting PieceCID, data set IDs, provider IDs, piece IDs, retrieval URLs, and commit transactions.
5. Read PDP timing and retrieve the Piece independently from both providers.
6. Deliver the result as a signed webhook.

No UI work began until both Filecoin copies had been committed and independently retrieved with PieceCID validation.

## 3. Provider-selection debugging

The first automatic provider selection failed because the Synapse SDK provider ping has a one-second timeout. The registered endorsed providers were reachable from the development machine but close to that limit.

AI-assisted diagnosis enumerated the on-chain approved and endorsed provider sets and measured their PDP endpoints. The solution was to explicitly select:

- Provider 4: endorsed primary.
- Provider 2: approved secondary.

This skipped the fragile auto-selection ping without bypassing storage, SP-to-SP transfer, on-chain commit, PDP, or retrieval verification.

## 4. Live evidence

The resulting fixture is:

- PieceCID: `bafkzcibd7abqltt56fv3bmluogfje7chexq4teeo6cyiyjz2eb2kcflkpj5uujak`
- Provider 4 / data set 19731.
- Provider 2 / data set 19730.

Both provider downloads returned the same 512 bytes and passed Synapse PieceCID validation. Later checks observed advancing PDP proof timestamps and future proof deadlines.

## 5. Webhook productization

After the Filecoin path worked, AI was used to implement and test:

- Normalized `healthy`, `degraded`, `unhealthy`, and `unknown` states.
- `piece.health.checked`, `piece.health.degraded`, and clearly labelled `webhook.test` events.
- HMAC-SHA256 signatures over `timestamp + "." + rawBody`.
- Event IDs and caller-defined subscription IDs.
- Three-attempt delivery retry.
- HTTPS and private-network URL controls.
- Atomic JSON delivery logging for the single-instance MVP.
- A non-overlapping optional scheduler.
- A minimal operational console.
- A public-receipt checking path that does not require the monitored data set to belong to the service wallet.

## 6. Verification

The final local verification included:

- TypeScript typecheck.
- Production build.
- Twelve automated tests.
- HMAC mutation rejection.
- HTTP retry integration test: two HTTP 500 responses followed by one HTTP 202.
- URL safety tests.
- Live Calibration PDP reads.
- Live independent retrieval from both providers.
- Live signed webhook delivery and receiver verification.
- Dependency audit with zero known vulnerabilities.

AI suggestions were accepted only after code, chain, provider, or HTTP evidence confirmed them.

## 7. Wallet-scoped product iteration

After the first Filecoin-to-webhook vertical slice was proven, the UI was upgraded from a fixed demo receipt to a wallet-scoped experience:

- Added an official MetaMask connection control and Calibration network switching.
- Added an explicit MetaMask account picker through **Switch wallet**.
- Queried FOC data sets and active PieceCIDs by the connected payer address.
- Rebuilt provider URLs from the onchain Service Provider Registry.
- Revalidated wallet ownership and Piece membership for every check.
- Added empty-wallet behavior with no fallback to fixture data.
- Cleared Piece, provider, health, and delivery state on account or chain changes.
- Added async response guards so an old wallet request cannot repopulate a newly selected wallet's view.
- Removed runtime dependence on `FILECOIN_PRIVATE_KEY`; public chain reads now power the Web service.

The known two-provider Piece was then checked through the wallet endpoint. Both copies validated, the resulting health state was `healthy`, and the signed local receiver returned HTTP 202. The same PieceCID submitted under an unrelated wallet was rejected.
