# Deployment guide

This release has local build, test, and browser checks; it has not been deployed. Use a staging environment before releasing private alumni data. The test report distinguishes synthetic persistence from real MongoDB verification.

## Hosting layout

Use one Node service and the built static web application behind one HTTPS origin, with a private persistent upload directory and a MongoDB replica set. This fits the existing session cookies, proxy paths, and local-storage fallback without adding provider-specific infrastructure. A managed MongoDB replica set or an operator-maintained replica set works; a standalone MongoDB server does not support the transactions used by Prisma. Keep one application instance until shared file storage and distributed rate limiting are provisioned.

Build on the deployment OS so the generated Prisma native engine matches that platform. Node 26.10.0 and pnpm 12.5.1 were used for the recorded checks. Dependencies require Node 22 or later; verify a different runtime before adopting it.

## Environment inventory

Server values belong in the service secret manager or protected `apps/server/.env`. Web values belong in the build environment or `apps/web/.env`; `VITE_SERVER_URL` is public. Bootstrap values belong in protected `packages/db/.env` or the seed process environment. Never commit filled-in environment files.

| Variable                       | Purpose                                                                  | Required                              | Safe format                             | Configure at                                                 |
| ------------------------------ | ------------------------------------------------------------------------ | ------------------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| `NODE_ENV`                     | Runtime mode and secure cookies                                          | Yes for production                    | `production`                            | Server and web build                                         |
| `ALLOW_PUBLIC_SIGNUP`          | Permit unprovisioned production accounts to receive global Viewer access | No; disabled by default in production | `false`                                 | Server; enable only after institutional access-policy review |
| `DATABASE_URL`                 | Named MongoDB database and restricted credentials                        | Yes                                   | `mongodb+srv://.../alumni_tracking`     | Server secret; imported by DB tools                          |
| `CORS_ORIGIN`                  | Exact browser origin allowed to mutate data                              | Yes                                   | `https://alumni.example.org`            | Server                                                       |
| `APP_URL`                      | Public API URL and OAuth callback base                                   | Yes                                   | `https://alumni.example.org`            | Server                                                       |
| `VITE_SERVER_URL`              | Browser RPC base URL                                                     | Yes                                   | `https://alumni.example.org`            | Web build                                                    |
| `PORT`                         | Node listening port                                                      | No; default 3000                      | `3000`                                  | Server process                                               |
| `API_PROXY_TARGET`             | Development Vite proxy destination                                       | Development only                      | `http://localhost:3000`                 | Web dev process                                              |
| `UPLOAD_DIR`                   | Private persistent local file directory                                  | Set explicitly in production          | `/srv/collab-private/uploads`           | Server                                                       |
| `RECAPTCHA_SITE_KEY`           | Google reCAPTCHA v2 public widget key                                    | If reCAPTCHA enabled in production    | Provider-issued site key                | Server; returned publicly by auth config                     |
| `RECAPTCHA_SECRET_KEY`         | Server verification key                                                  | If reCAPTCHA enabled in production    | Secret value                            | Server secret                                                |
| `GOOGLE_CLIENT_ID`             | Google OAuth client                                                      | For Google sign-in                    | Provider client ID                      | Server                                                       |
| `GOOGLE_CLIENT_SECRET`         | OAuth client secret                                                      | For Google sign-in                    | Secret value                            | Server secret                                                |
| `GOOGLE_SERVICE_ACCOUNT_JSON`  | Service account JSON with private key                                    | For Drive or Sheets                   | Single JSON string                      | Server secret                                                |
| `GOOGLE_DRIVE_FOLDER_ID`       | Private evidence folder                                                  | For Drive uploads                     | Provider folder ID                      | Server                                                       |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Import/export spreadsheet                                                | For Sheets                            | Provider spreadsheet ID                 | Server                                                       |
| `GOOGLE_FORMS_WEBHOOK_SECRET`  | Shared webhook authentication value                                      | For Forms in production               | Random secret                           | Server secret and sender configuration                       |
| `SMTP_URL`                     | HTTPS JSON mail gateway, despite the legacy name                         | For email                             | `https://mail-gateway.example.org/send` | Server secret if URL contains credentials                    |
| `SMTP_FROM`                    | Mail gateway sender address                                              | Optional; set for real delivery       | `alumni@example.org`                    | Server                                                       |
| `IMGBB_API_KEY`                | Public profile-photo hosting                                             | For imgBB photos                      | Secret value                            | Server secret                                                |
| `IMAGE_HOST_PROVIDER`          | Photo provider preference                                                | Optional                              | `local`, `imgbb`, or `google_drive`     | Server                                                       |
| `SESSION_SECRET`               | Legacy variable, unused by opaque database sessions                      | No                                    | Leave unset                             | Do not treat as a security control                           |
| `SEED_ADMIN_EMAIL`             | Bootstrap administrator identity                                         | For seed                              | Privately supplied email                | Seed process / protected DB env                              |
| `SEED_ADMIN_PASSWORD`          | Bootstrap password, at least 12 characters                               | For seed                              | Privately generated password            | Seed secret                                                  |
| `SEED_DEMO_DATA`               | Adds synthetic academic/alumni samples                                   | No; default `false`                   | `false`                                 | Seed process; `true` rejected in production                  |

`SMTP_URL` does not implement SMTP transport: `smtp://` URLs are rejected. The gateway receives JSON containing `from`, `to`, `subject`, and `text`. Configure access control at that gateway. Unconfigured mail fails explicitly; message contents are not logged.

## Prepare and verify

1. Provision a restricted OS service account, one HTTPS domain, a persistent private volume, and a MongoDB replica set. Restrict database access to the service network; use a dedicated application database credential and separate backup credentials.
2. Check out the desired release commit. Copy the committed server/web environment examples only if local files do not already exist. Set the required variables privately. Set bootstrap variables only for initialization; do not paste credentials into shell history.
3. Install the declared package manager (or use an existing compatible installation):

   ```sh
   npm install --global pnpm@12.5.1
   pnpm install --frozen-lockfile
   pnpm env:generate
   pnpm db:generate
   pnpm --filter @Alumni-Tracking-Ss/db exec prisma validate
   ```

4. Back up any existing database and private upload directory before applying schema/index changes. Review the schema diff on a staging clone. For a new approved database only, run `pnpm db:push`. Do not use `--accept-data-loss` or `--force-reset`. This release changes no Prisma model fields and needs no data migration on an existing matching database. Prisma Migrate is not supported for this MongoDB project; misleading migrate scripts were removed.
5. Initialize permissions, system roles, integration settings, and the privately configured administrator with `pnpm db:seed`. Existing users are not overwritten; an existing bootstrap email is not automatically elevated. Editable role permission assignments are preserved; missing protected Super Admin permissions are restored. No demo records are added unless explicitly enabled in development. Review and rotate any account that was initialized by the previous public demo credentials; changing seed code does not change existing passwords.
6. Run isolated checks before pointing the service at real data:

   ```sh
   pnpm check-types
   pnpm lint
   pnpm test
   pnpm check:secrets
   pnpm audit
   pnpm exec playwright install chromium
   pnpm test:browser
   pnpm build
   ```

   On a fresh clone, generate route types with a web build before `check-types`: `pnpm --filter web build`. Browser tests use ports 3100 and 3101 and a synthetic database adapter; they do not verify real MongoDB rollback or durability. Follow `docs/test-report.md` for the remaining staging checks.

7. Build and install on the same OS/runtime as the service. The server build copies generated Prisma query engines into `apps/server/dist`. Keep the workspace production dependencies available at runtime; the web output is `apps/web/dist` and the API entry is `apps/server/dist/index.mjs`.
8. Create `UPLOAD_DIR` owned only by the application account, outside static roots. Mount it persistently and encrypt backups. Private evidence defaults to local storage if Drive is unavailable. Set disk quotas and capacity alerts. imgBB is for intentionally public profile photos; never put private employment evidence there. Drive uploads stay private and are downloaded through the authorized API.

## HTTPS and process configuration

Run the API from `apps/server` with `pnpm start` under a service manager. Load runtime secrets before starting. The service must restart on failure and forward sanitized logs to the operational logging system. Do not use the Vite development server as the public production server.

An example Caddy route layout, requiring operator installation/configuration of Caddy and real DNS, is:

```caddyfile
alumni.example.org {
    handle /rpc* {
        reverse_proxy 127.0.0.1:3000
    }
    handle /api/* {
        reverse_proxy 127.0.0.1:3000
    }
    handle /health/* {
        reverse_proxy 127.0.0.1:3000
    }
    handle {
        root * /srv/collab/apps/web/dist
        try_files {path} /index.html
        file_server
    }
}
```

Point DNS at the selected host, validate proxy configuration, and provision HTTPS. Use the same origin for `CORS_ORIGIN`, `APP_URL`, and `VITE_SERVER_URL`; this keeps raw auth/file URLs and session cookies coherent. Restrict direct API network access to the proxy. Set a proxy request limit consistent with the API's 10 MB file limit plus multipart overhead. Configure gateway-level abuse limits: application rate limits use process-local memory and the socket peer address, so all clients behind one proxy share a budget unless a trusted edge applies limits separately. The application intentionally does not trust arbitrary forwarded IP headers.

Set a site-specific Content Security Policy at the static host after testing Google sign-in/reCAPTCHA. The API supplies standard security headers and no-store responses. Do not enable production debug tooling or expose internal service ports publicly.

## Optional integrations

- In Settings > Integrations, enable only configured services. A configured status means variables exist; it does not verify provider access.
- Google sign-in: register the exact `{APP_URL}/api/auth/google/callback` redirect URL and allowed origins. Verify state-cookie rejection, verified email handling, disabled accounts, and successful sign-in in staging. Existing email accounts can be linked through verified Google email.
- reCAPTCHA: use a v2 checkbox site/secret key pair registered for the deployed hostname. The browser renders the provider widget and the server verifies its token. The local checkbox is development-only; production rejects that fallback. If reCAPTCHA is enabled without keys, sign-in fails until keys are configured or an administrator disables the integration.
- Drive: enable Drive API, share only the private evidence folder with the service account, and verify upload plus authenticated download. Do not make the folder public. Local fallback requires persistent space even when Drive is configured.
- Sheets: enable Sheets API and share only the designated sheet with the service account. Verify import and RAW-value export. Existing reads are limited to A1:Z1000; schedule larger imports manually until pagination is implemented.
- Forms: configure the sender to POST JSON to `/api/integrations/google-forms/webhook` with `x-webhook-secret`. Production refuses a missing server secret. Replay protection/deduplication is still outstanding; leave this integration disabled until sender retries and replay behavior are reviewed.
- Email: configure the HTTPS gateway and sender. Run Send test in Settings and confirm actual receipt. A successful HTTP response is not proof of delivery.
- imgBB: verify public-photo use is permitted by the institution before enabling it.

## Release smoke tests and recovery

1. Confirm `/health/live` returns 200 and `/health/ready` returns 200 only when MongoDB is reachable. A 503 readiness response must keep the service out of rotation.
2. Sign in using the privately initialized administrator. Confirm public signup is disabled in production by default. If explicitly permitted by policy, new accounts receive global Viewer access, never administrator access. New Google users must also be pre-provisioned unless public signup is enabled. Confirm Settings navigation, profile update, password change, and other-session revocation.
3. Exercise role masters, mixed states, individual permissions, save/reload, concurrent browser saves, and simulated failures against an isolated staging replica set. Verify protected administrator records cannot be disabled, stripped of roles, or have their role permissions cleared through the API.
4. Use a low-privilege staging account to verify forbidden API responses independently of hidden navigation. Verify anonymous/disabled users cannot upload, preview, or download evidence. Verify evidence URLs and storage keys are absent from alumni API responses.
5. Upload allowed synthetic files, reject spoofed and oversized files, then verify an authorized download. Signature checking is not malware scanning. Institution-specific malware scanning, storage quotas, and retention/purge jobs require operational decisions and are not implemented by this release.
6. Confirm desktop/mobile layouts and keyboard access. Automated axe checks cover Settings role and integration pages; arrange screen-reader and broader workflow checks before declaring full WCAG conformance.
7. Schedule database snapshots and upload-volume backups with encryption and restricted access. Restore both into a separate environment and verify role assignments, evidence references, and downloads. Record restore time, recovery point, and recovery time objectives.
8. Monitor readiness, 5xx/403/429 rates, disk growth, database latency, audit-log growth, and external-provider failures. Never log tokens, passwords, private keys, file contents, or full provider responses.
9. For application rollback, redeploy the previous built commit together with its lockfile and generated Prisma engine. Revoke sessions if reverting authentication changes. This release has no schema-field migration; do not restore an old database over new user data as a routine rollback. If data restoration is necessary, stop writes, take a final backup, obtain operational approval, then restore matched database and upload snapshots.
10. Remove bootstrap password variables from the steady-state service environment after initialization. Review account/role changes and dependency advisories regularly. Run the recorded gates on every dependency or permission change.

## Release blockers

- Real MongoDB transaction, concurrent-save, bootstrap, and backup-restore checks are unverified. Supply an isolated replica set and test credentials; do not reuse production data.
- No deployment host, domain, proxy, persistent volume, monitoring, or restore drill has been verified.
- External-provider flows require owner-supplied credentials and staging verification. Keep unverified integrations disabled.
- Forms replay handling, malware/retention policy, large-list pagination, and multi-instance storage/rate limiting remain explicit limitations. Review these against the institution's deployment requirements before enabling the corresponding workloads.

The application is not declared production-ready on the basis of compilation or synthetic tests.
