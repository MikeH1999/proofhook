# Proofhook deployment runbook

## Current readiness

- Public deployment: `https://proofhook-production.up.railway.app`.
- Public repository: `https://github.com/MikeH1999/proofhook`.
- Production build: verified with `node dist/server.js`.
- Runtime private key: not required.
- Manual receiver URL: use `PROOFHOOK_DEMO_WEBHOOK_URL=auto`.
- Health endpoint: `/api/health`.
- Container and Railway definitions: included.
- Persistent delivery history: mount a volume at `/app/data`.
- Persistence verification: a service restart preserved the existing wallet delivery event.
- Recommended replicas: one while JSON persistence and the optional in-process scheduler remain in scope.

## 1. Final local gate

```powershell
npm.cmd run verify:live
git status --short
```

The first command must pass and the second should print nothing.

## 2. Publish the repository

The authenticated GitHub account can create the submission repository after its visibility is chosen:

```powershell
gh repo create proofhook --public --source=. --remote=origin --push
```

Change `--public` to `--private` only if the hackathon permits a private repository. Do not run both variants.

## 3. Authenticate Railway

The project can use a temporary CLI without adding it to `package.json`:

```powershell
npx.cmd --yes @railway/cli@5.26.2 login
```

This step requires completing Railway's browser/device authorization.

## 4. Create the project and service

Generate a random webhook secret locally and keep it out of shell history where possible. Then run:

```powershell
npx.cmd --yes @railway/cli@5.26.2 init --name proofhook
npx.cmd --yes @railway/cli@5.26.2 add --service proofhook `
  --variables "PROOFHOOK_WEBHOOK_SECRET=<random-32-byte-secret>" `
  --variables "PROOFHOOK_ADMIN_KEY=<different-random-32-byte-secret>" `
  --variables "PROOFHOOK_DEMO_WEBHOOK_URL=auto" `
  --variables "PROOFHOOK_ALLOW_PRIVATE_WEBHOOK_URLS=false" `
  --variables "PROOFHOOK_SCHEDULE_SECONDS=0" `
  --variables "PROOFHOOK_RECEIPT_PATH=/app/fixtures/demo-receipt.json" `
  --variables "PROOFHOOK_DELIVERY_LOG_PATH=/app/data/delivery-log.json"
```

`auto` derives the manual demo receiver from the public request host. If the scheduler is later enabled, replace it with the explicit public URL and set a non-zero schedule.

## 5. Upload and deploy

```powershell
npx.cmd --yes @railway/cli@5.26.2 up --service proofhook --detach
$status = npx.cmd --yes @railway/cli@5.26.2 status --json | ConvertFrom-Json
$environmentId = $status.environments.edges[0].node.id
$serviceId = $status.services.edges[0].node.id
npx.cmd --yes @railway/cli@5.26.2 volume --service $serviceId --environment $environmentId add --mount-path /app/data
npx.cmd --yes @railway/cli@5.26.2 domain --service proofhook
```

Using IDs from `status --json` avoids a Railway CLI name-resolution bug in `volume add`. Adding the volume triggers a redeploy.

The generated production domain is `https://proofhook-production.up.railway.app`.

## 6. Public verification

```powershell
Invoke-RestMethod https://<deployment-domain>/api/health
```

Then open the deployment, connect MetaMask, select the prepared PieceCID, run a Filecoin check, and verify:

- two provider copies;
- PDP current;
- both retrievals verified;
- `piece.health.checked`;
- HTTP 202;
- HMAC verified;
- event `walletAddress` matches MetaMask.

## 7. Complete submission metadata

Replace the three placeholders in `docs/submission.md` with the GitHub repository, Railway deployment, and demo video URLs. Re-run `npm run verify:live` immediately before submission.
