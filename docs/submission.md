# Proofhook submission notes

## One-line description

Proofhook turns wallet-scoped Filecoin Onchain Cloud proof and retrieval health into signed, retrying webhooks.

## Problem

Applications that depend on Filecoin storage currently need to understand contracts, PDP epochs, provider registries, retrieval endpoints, PieceCID validation, and alert delivery. That integration cost keeps Filecoin state outside the normal application event loop.

## Product mechanism

Connect MetaMask, select one Piece owned by that wallet, and click **Run Filecoin check**. Proofhook verifies the wallet-to-data-set relationship onchain, checks every matching provider copy, and delivers one HMAC-signed HTTP event.

## User flow

```text
MetaMask
  -> Filecoin Calibration
  -> wallet-owned FOC data sets
  -> active PieceCID selection
  -> PDP + provider retrieval verification
  -> signed webhook with retry and delivery history
```

Changing accounts through **Switch wallet** immediately clears the previous account's Piece, health, provider, and webhook views. Wallets without FOC storage receive an empty state, never demo data.

## Filecoin and FOC primitives demonstrated

- Synapse SDK-compatible PieceCID parsing and byte validation.
- Filecoin Warm Storage data sets scoped by payer address.
- PDP active pieces, challenge epochs, proving windows, and deadlines.
- Service Provider Registry IDs and PDP service URLs.
- Independent retrieval validation across multiple provider copies.
- Filecoin Calibration network through public RPC reads.

## Security boundary

- The running Web service has no wallet private key.
- The backend rebuilds wallet, data-set, PieceCID, and provider relationships from chain state.
- Browser-supplied data-set IDs and retrieval URLs are not trusted by the wallet check endpoint.
- Webhooks use HMAC-SHA256 signatures, URL validation, SSRF controls, and bounded retry.
- Delivery history is filtered by the connected wallet address.

## Live evidence

- PieceCID: `bafkzcibd7abqltt56fv3bmluogfje7chexq4teeo6cyiyjz2eb2kcflkpj5uujak`
- Provider 4 / data set 19731.
- Provider 2 / data set 19730.
- Both copies have been retrieved and validated.
- A wallet-scoped check produced `healthy` and a verified HTTP 202 webhook delivery.

## MVP scope

Calibration only, manual checks, one local signed receiver, JSON delivery persistence, and a single-instance optional scheduler. Mainnet, hosted notification channels, and multi-instance scheduling are intentionally outside the hackathon MVP.

## Submission links to fill

- Repository: `<repository-url>`
- Live demo: `<deployment-url>`
- Demo video: `<video-url>`
