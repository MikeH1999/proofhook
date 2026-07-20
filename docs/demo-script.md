# Proofhook 80-second demo

## 0-10 seconds: the problem

"Filecoin exposes verifiable storage state, but ordinary applications should not need to poll contracts, interpret PDP epochs, probe storage providers, and build retrying alert infrastructure."

Open `https://proofhook-production.up.railway.app` and point out the Filecoin Calibration indicator.

## 10-25 seconds: wallet-scoped discovery

Click **Connect MetaMask**. MetaMask switches to Filecoin Calibration if needed.

"Proofhook uses the connected wallet as its data boundary. It reads that wallet's FOC data sets and active PieceCIDs from public onchain state. The app never receives a private key."

Select the prepared PieceCID:

`bafkzcibd7abqltt56fv3bmluogfje7chexq4teeo6cyiyjz2eb2kcflkpj5uujak`

Point out the two provider copies. The separate **Switch wallet** control opens MetaMask's account picker; switching accounts clears all old Piece, health, and delivery state.

## 25-50 seconds: Filecoin health check

Select the PieceCID under **Your FOC storage**, then click **Check health**.

"The server re-queries the wallet before every check. It refuses a PieceCID that does not belong to that wallet, derives provider retrieval URLs from the onchain registry, reads PDP timing, and validates the retrieved bytes against the PieceCID."

Show:

- Provider 4 / data set 19731.
- Provider 2 / data set 19730.
- PDP current.
- Retrieval verified for both copies.
- Independent latency measurements and next proof deadlines.

## 50-70 seconds: webhook delivery

Open the newest delivery and show:

- `piece.health.checked`.
- The connected `walletAddress` and selected PieceCID.
- Both provider results.
- HTTP 202 and the attempt count.
- `HMAC verified`.

"This is the product mechanism: Filecoin state becomes a normal signed webhook that any backend can consume."

## 70-80 seconds: close

"Proofhook makes Filecoin Onchain Cloud observable through a familiar developer primitive while preserving Filecoin's verifiable proof and retrieval properties."

End on the public Calibration evidence in the README.

## Pre-demo smoke check

1. Select the prepared Calibration wallet in MetaMask.
2. Ensure the target PieceCID appears in the picker.
3. Run:

```powershell
npm.cmd run verify:live
npm.cmd run start:prod
```

4. Confirm `https://proofhook-production.up.railway.app/api/health`.
5. Open the public deployment and run one health check before recording.

The Web service does not require `FILECOIN_PRIVATE_KEY`; only the optional seed/info scripts use it.
