# Proofhook submission notes

## One-line description

Proofhook turns wallet-scoped Filecoin Onchain Cloud proof and retrieval health into signed, retrying webhooks.

## Problem

Applications that depend on Filecoin storage currently need to understand contracts, PDP epochs, provider registries, retrieval endpoints, PieceCID validation, and alert delivery. That integration cost keeps Filecoin state outside the normal application event loop.

## Product mechanism

Connect MetaMask and either upload a file through Synapse SDK or select an existing Piece owned by that wallet. The upload goes directly to two FOC providers and commits the PieceCID under the current payer. Click **Run Filecoin check** and Proofhook verifies the wallet-to-data-set relationship onchain, checks every matching provider copy, and delivers one HMAC-signed HTTP event.

## User flow

```text
MetaMask
  -> Filecoin Calibration
  -> browser-to-FOC upload on providers 4 and 2
  -> MetaMask funding/approval + onchain PieceCID commit
  -> wallet-owned FOC data sets
  -> active PieceCID selection
  -> PDP + provider retrieval verification
  -> signed webhook with retry and delivery history
```

Changing accounts through **Switch wallet** immediately clears the previous account's Piece, health, provider, and webhook views. Wallets without FOC storage receive an empty state, never demo data.

## Filecoin and FOC primitives demonstrated

- Synapse SDK-compatible PieceCID parsing and byte validation.
- Synapse SDK multi-copy upload using store, provider-to-provider pull, and onchain commit.
- Filecoin Warm Storage data sets scoped by payer address.
- PDP active pieces, challenge epochs, proving windows, and deadlines.
- Service Provider Registry IDs and PDP service URLs.
- Independent retrieval validation across multiple provider copies.
- Filecoin Calibration network through public RPC reads.

## Security boundary

- The running Web service has no wallet private key.
- Upload bytes travel from the browser to FOC providers and are never proxied through Proofhook.
- The backend rebuilds wallet, data-set, PieceCID, and provider relationships from chain state.
- Browser-supplied data-set IDs and retrieval URLs are not trusted by the wallet check endpoint.
- Webhooks use HMAC-SHA256 signatures, URL validation, SSRF controls, and bounded retry.
- Delivery history is filtered by the connected wallet address.
- Public chain/retrieval operations are rate-limited, while unscoped logs and custom webhook targets require the production admin key.

## Live evidence

- PieceCID: `bafkzcibd7abqltt56fv3bmluogfje7chexq4teeo6cyiyjz2eb2kcflkpj5uujak`
- Provider 4 / data set 19731.
- Provider 2 / data set 19730.
- Both copies have been retrieved and validated.
- A wallet-scoped check produced `healthy` and a verified HTTP 202 webhook delivery.

## MVP scope

Calibration only, manual checks, one built-in signed receiver, JSON delivery persistence, and a single-instance optional scheduler. Mainnet, hosted notification channels, and multi-instance scheduling are intentionally outside the hackathon MVP.

## Submission links

- Repository: https://github.com/MikeH1999/proofhook
- Live demo: https://proofhook-production.up.railway.app
- Demo video: `<video-url>`
