# Proofhook Demo Video Set

Record four short videos instead of one long product tour. Each video has one mechanism, one proof point, and a clear ending. Keep the browser at 1280x720 or 1440x900, hide personal notifications, and never show a private key or seed phrase.

Use the production deployment for the recording:

`https://proofhook-production.up.railway.app`

Use the prepared Calibration fixture for the health and webhook videos:

- PieceCID: `bafkzcibd7abqltt56fv3bmluogfje7chexq4teeo6cyiyjz2eb2kcflkpj5uujak`
- Provider 4 / data set `19731`
- Provider 2 / data set `19730`

Before recording, connect the prepared MetaMask account to Filecoin Calibration and make sure the PieceCID appears under **Your FOC storage**. Do not record a fake success state: for upload or repair, use a real test file and wait for the onchain result.

## 1. Wallet-Scoped Health Check (80 seconds)

**Mechanism:** one PieceCID becomes a verifiable health result across every provider copy.

**0-08 seconds - Set the problem**

Show the Proofhook landing state and Filecoin Calibration indicator.

Say: “Filecoin exposes verifiable storage state, but applications should not need to poll contracts, interpret PDP timing, probe providers, and build alert delivery themselves.”

**08-20 seconds - Connect the wallet**

Click **Connect MetaMask**, approve the account, and let the app switch to Calibration if prompted.

Say: “Proofhook uses the connected wallet as the data boundary. It reads that wallet's Filecoin Onchain Cloud data sets without receiving a private key.”

**20-32 seconds - Select a PieceCID**

Open **Your FOC storage**, select the prepared PieceCID, and pause on the two Provider copies.

Say: “This wallet owns two independent provider copies of the same PieceCID.”

**32-55 seconds - Run the check**

Click **Check health**. Keep the loading state visible briefly, then show the result.

Say: “The server revalidates wallet ownership, reads PDP timing, retrieves both copies, validates the bytes against the PieceCID, and measures each retrieval.”

**55-72 seconds - Show evidence**

Point to `healthy`, `Current`, `Verified`, latency, and `Next proof due`. Point to **Open retrieval URL** under each Retrieval status and open one in a new tab if time permits.

Say: “The result is not a dashboard guess: both retrievals are verified, PDP proof timing is current, and each provider's retrieval endpoint is directly inspectable.”

**72-80 seconds - Close**

Say: “One Filecoin PieceCID is now a normal, explainable health result for an application.”

## 2. FOC Upload and Repair to Two Copies (85 seconds)

**Mechanism:** a browser upload is committed to two chain-approved providers, with an explicit repair path when redundancy drops.

**0-10 seconds - Choose a file**

In **Upload a file**, click **Choose file** and select a small test file. Keep the `Maximum file size: 500 MB` text visible.

Say: “The file goes directly from this browser to Filecoin Onchain Cloud. Proofhook's MVP accepts files up to 500 MB.”

**10-28 seconds - Start the upload**

Click **Upload to FOC** and show the progress bar and provider-selection status.

Say: “Proofhook checks the current approved provider list, waits for reachable Calibration responses, and selects two independent targets. The backend never receives the file bytes.”

**28-45 seconds - Approve the onchain actions**

Approve the MetaMask funding, approval, and commit prompts. Keep the status text visible while the transaction confirms.

Say: “MetaMask authorizes the funding and the onchain storage commit. The resulting PieceCID is refreshed into this wallet's storage list.”

**45-60 seconds - Show the result**

Select the new PieceCID. Point to the provider rows and the copy count. If the result is `2 copies`, say that the upload reached the redundancy target.

Say: “The UI shows the PieceCID, the two data sets, and the provider copies that were committed.”

**60-76 seconds - Demonstrate repair**

For this segment, use a real test PieceCID with fewer than two healthy copies. Select it and point to **Repair to 2 copies** beside the PieceCID selector. Click it and approve MetaMask.

Say: “When a Piece falls below the two-copy target, Proofhook does not ask for a re-upload. An approved provider pulls the existing Piece from a healthy provider and commits the second copy onchain.”

**76-85 seconds - Close**

Wait for the success status and show `2 copies`.

Say: “Redundancy is repaired using the existing Piece, with MetaMask authorization and a verifiable Filecoin commit.”

## 3. Scheduled Health to Signed Webhook (85 seconds)

**Mechanism:** one wallet signature creates a recurring Railway job that turns Filecoin state into signed HTTP events.

**0-12 seconds - Configure the interval**

Scroll to **Check every copy automatically**. Leave the interval at `3 hours` or change it to a visible test interval.

Say: “The schedule checks every PieceCID and every provider copy. The default interval is three hours.”

**12-27 seconds - Enable the monitor**

Click **Enable monitoring & run now** and approve the MetaMask signature.

Say: “The wallet signs the schedule. Proofhook runs the first wallet-wide check immediately, then persists the schedule on Railway.”

**27-44 seconds - Show the run group**

Scroll to **Health run groups** and open the newest completed run.

Say: “Each run is grouped by interval with its aggregate health, reason, Piece count, verified-copy count, and Webhook delivery count.”

**44-62 seconds - Show the offline boundary**

Point to the text stating that Railway continues while the browser is closed and the wallet is offline. Do not disconnect the wallet during the recording unless the schedule is already persisted.

Say: “After the schedule is signed, routine checks do not depend on this browser staying open or the wallet staying online. A paid Repair is different and still requires a fresh MetaMask authorization.”

**62-76 seconds - Show the signed delivery**

Open the newest run details and point to the Webhook status, HTTP `202`, attempt count, and `HMAC verified` receiver result.

Say: “The familiar developer primitive is a signed webhook. The payload contains the wallet, PieceCID, provider results, health state, and delivery evidence.”

**76-85 seconds - Test the receiver and close**

Click **Test webhook**, show the success toast, then return to the run details.

Say: “The built-in receiver makes the complete Filecoin-to-HTTP flow observable in one screen.”

## 4. Wallet Boundary and Provider Debugging (70 seconds)

**Mechanism:** account switching changes the complete data boundary, while provider retrieval links make a result independently inspectable.

**0-12 seconds - Establish the wallet boundary**

Start with a connected wallet and its Piece list visible. Say: “Every PieceCID shown here belongs to the connected payer wallet.”

**12-28 seconds - Switch accounts**

Click **Switch wallet**, choose a second Calibration account, and show the list clearing and reloading.

Say: “Switching accounts clears the previous Piece, health, and delivery state. The server also refuses a health check for a PieceCID that is not owned by the requested wallet.”

**28-45 seconds - Inspect a provider URL**

Select a PieceCID, run **Check health**, and point to **Open retrieval URL** under each provider's Retrieval status.

Say: “Each copy exposes the exact HTTPS retrieval endpoint used for verification. The link opens in a new tab without exposing the full URL in the table layout.”

**45-60 seconds - Explain the states**

Point to the `healthy`, `degraded`, `unhealthy`, and `unknown` definitions.

Say: “The status is explainable: fewer than two healthy copies, a failed retrieval, an overdue proof, no retrievable copy, or inconclusive data each produce a different state.”

**60-70 seconds - Close**

Say: “Proofhook makes Filecoin observable without weakening wallet ownership or proof verification.”

## Recording checklist

- Record at 1280x720 or 1440x900 and keep the browser zoom at 100%.
- Keep the address bar visible for the public URL, but never show seed phrases, private keys, or wallet export screens.
- Use one clear cursor movement per action and pause for 1–2 seconds after each result appears.
- Keep each exported clip between 60 and 90 seconds; trim dead time, not evidence.
- Use the same Calibration fixture in the health and webhook videos so the provider IDs and PieceCID remain consistent.
- For the upload and repair video, record only after a real transaction receipt or repair result is available.
- End every clip on a Filecoin proof, provider copy, Retrieval URL, onchain transaction, or signed Webhook result.
