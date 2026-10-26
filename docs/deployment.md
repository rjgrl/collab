# Deployment guide

Production startup requires exact HTTPS origins, valid keys, credentialed verified-TLS MongoDB, an absolute upload directory and MongoDB IP budgets. Listener defaults to loopback; set HOST deliberately for a reviewed private topology. TRUSTED_PROXY_IPS is exact IPs only, with one overwritten X-Forwarded-For address. Obtain authorization before provisioning or exposing infrastructure.

Use an isolated staging environment before releasing private alumni data. Local checks do not establish production readiness or verify provider delivery, failover or recovery.

## Hosting layout

Use one Node service and the built static web application behind one HTTPS origin, with a private persistent upload directory and a MongoDB replica set. This fits the existing session cookies, proxy paths, and local-storage fallback without adding provider-specific infrastructure. A managed MongoDB replica set or an operator-maintained replica set works; a standalone MongoDB server does not support the transactions used by Mongoose. Keep one application instance until shared file storage and distributed rate limiting are provisioned.

The Mongoose application requires no generated Prisma client or native query engine. Use the pinned Node 26.10.0 and pnpm 12.5.1 toolchain. Supported Node ranges are 22.18+, 24.11+, or 26+; verify a different runtime before adopting it.

## Environment inventory

Server values belong in the service secret manager or protected `apps/server/.env`. Web values belong in the build environment or `apps/web/.env`; `VITE_SERVER_URL` is public. Bootstrap values belong in protected `packages/db/.env` or the seed process environment. Never commit filled-in environment files.

| Variable                                   | Purpose                                                                        | Required                                | Safe format                                       | Configure at                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| `NODE_ENV`                                 | Runtime mode and secure cookies                                                | Yes for production                      | `production`                                      | Server and web build                                         |
| `ALLOW_PUBLIC_SIGNUP`                      | Permit unprovisioned production accounts to receive Alumni self-service access | No; disabled by default in production   | `false`                                           | Server; enable only after institutional access-policy review |
| `DATABASE_URL`                             | Named MongoDB database and restricted credentials                              | Yes                                     | `mongodb+srv://.../alumni_tracking`               | Server secret; imported by DB tools                          |
| `CORS_ORIGIN`                              | Exact browser origin allowed to mutate data                                    | Yes                                     | `https://alumni.example.org`                      | Server                                                       |
| `APP_URL`                                  | Public API URL and OAuth callback base                                         | Yes                                     | `https://alumni.example.org`                      | Server                                                       |
| `VITE_SERVER_URL`                          | Browser REST API base URL                                                      | Yes                                     | `https://alumni.example.org`                      | Web build                                                    |
| `PORT`                                     | Node listening port                                                            | No; default 3000                        | `3000`                                            | Server process                                               |
| `API_PROXY_TARGET`                         | Development Vite proxy destination                                             | Development only                        | `http://localhost:3000`                           | Web dev process                                              |
| `UPLOAD_DIR`                               | Private persistent local file directory                                        | Set explicitly in production            | `/srv/collab-private/uploads`                     | Server                                                       |
| `RECAPTCHA_SITE_KEY`                       | Google reCAPTCHA v2 public widget key                                          | If reCAPTCHA enabled in production      | Provider-issued site key                          | Server; returned publicly by auth config                     |
| `RECAPTCHA_SECRET_KEY`                     | Server verification key                                                        | If reCAPTCHA enabled in production      | Secret value                                      | Server secret                                                |
| `GOOGLE_CLIENT_ID`                         | Google OAuth client                                                            | For Google sign-in                      | Provider client ID                                | Server                                                       |
| `GOOGLE_CLIENT_SECRET`                     | OAuth client secret                                                            | For Google sign-in                      | Secret value                                      | Server secret                                                |
| `GOOGLE_SERVICE_ACCOUNT_JSON`              | Service account JSON with private key                                          | For Drive or Sheets                     | Single JSON string                                | Server secret                                                |
| `GOOGLE_DRIVE_FOLDER_ID`                   | Private evidence folder                                                        | For Drive uploads                       | Provider folder ID                                | Server                                                       |
| `GOOGLE_SHEETS_SPREADSHEET_ID`             | Import/export spreadsheet                                                      | For Sheets                              | Provider spreadsheet ID                           | Server                                                       |
| `GOOGLE_FORMS_WEBHOOK_SECRET`              | Shared webhook authentication value                                            | For Forms in production                 | Random secret                                     | Server secret and sender configuration                       |
| `SMTP_URL`                                 | HTTPS JSON mail gateway, despite the legacy name                               | For email                               | `https://mail-gateway.example.org/send`           | Server secret if URL contains credentials                    |
| `SMTP_FROM`                                | Mail gateway sender address                                                    | Optional; set for real delivery         | `alumni@example.org`                              | Server                                                       |
| `IMGBB_API_KEY`                            | Public profile-photo hosting                                                   | For imgBB photos                        | Secret value                                      | Server secret                                                |
| `IMAGE_HOST_PROVIDER`                      | Photo provider preference                                                      | Optional                                | `local`, `imgbb`, or `google_drive`               | Server                                                       |
| `SESSION_SECRET`                           | HMAC key for expiring contact-verification codes                               | At least 32 characters for verification | Privately generated random value                  | Server secret store; not the opaque session token itself     |
| `MFA_ENCRYPTION_KEY`                       | AES-256-GCM authenticator encryption key                                       | Required in production                  | 64 hex characters, independent random 32-byte key | Separate protected secret/recovery backup                    |
| `PASSWORD_BREACH_CHECK`                    | Offline dictionary plus optional k-anonymity breach screening                  | Optional, default local                 | `local` or explicit `hibp` opt-in                 | Server; outages fail screening closed when opted in          |
| `AUTH_IP_STORE`                            | Authentication IP counter storage                                              | MongoDB by production default           | `mongodb` or `memory`                             | Keep MongoDB for multi-instance budget sharing               |
| `AUTH_IP_LIMIT` / `AUTH_IP_WINDOW_SECONDS` | Auth IP budget                                                                 | Defaults 30 / 900                       | Validated positive integers                       | Server; retain a trusted edge/proxy policy                   |
| `AUTH_ACCOUNT_LIMIT`                       | Shared login attempt budget per normalized account                             | Default 5 / 15 minutes                  | 1�100                                             | Server; successful login reservations are refunded           |
| `SESSION_IDLE_MINUTES`                     | Idle expiry with roughly one-minute activity-write coalescing                  | Default 30                              | 1�1440                                            | Server; seven-day absolute expiry remains                    |
| `SEED_ADMIN_EMAIL`                         | Bootstrap administrator identity                                               | For seed                                | Privately supplied email                          | Seed process / protected DB env                              |
| `SEED_ADMIN_PASSWORD`                      | Bootstrap password, at least 12 characters                                     | For seed                                | Privately generated password                      | Seed secret                                                  |
| `SEED_DEMO_DATA`                           | Adds synthetic academic/alumni samples                                         | No; default `false`                     | `false`                                           | Seed process; `true` rejected in production                  |

`SMTP_URL` does not implement SMTP transport: `smtp://` URLs are rejected. The gateway receives JSON containing `from`, `to`, `subject`, and `text`. Configure access control at that gateway. Unconfigured mail fails explicitly; message contents are not logged.

## Prepare and verify

1. Provision a restricted OS service account, one HTTPS domain, a persistent private volume, and a MongoDB replica set. Restrict database access to the service network; use a dedicated application database credential and separate backup credentials.
2. Check out the desired release commit. Copy the committed server/web environment examples only if local files do not already exist. Set the required variables privately. Set bootstrap variables only for initialization; do not paste credentials into shell history.
3. Install the declared package manager (or use an existing compatible installation):

   ```sh
   npm install --global pnpm@12.5.1
   pnpm install --frozen-lockfile
   pnpm env:generate
   pnpm db:migrate --dry-run
   ```

4. Back up the database and private uploads. Read [the cutover runbook](migrations/MONGOOSE_REST.md) and inspect the dry-run report on a staging clone. Review every existing index, duplicate preflight and conflict. Obtain target-specific authorization before `pnpm db:migrate --apply`. This adds absent collections/indexes and retires only the reviewed legacy `Department_code_key`, preserving its full definition in `MigrationIndexBackup`. It never resets records, rewrites names, auto-links accounts or reseeds; unrelated indexes remain intact. Confirm `User_alumniId_key` and FormsReceipt uniqueness before enabling dependent traffic. Run `pnpm db:verify-transactions` against the approved isolated replica set; the synthetic write rolls back. Preserve password/session formats and encryption keys for rollback compatibility.
5. Preserve existing production accounts and roles. Repository seeding refuses production; provisioning a new production administrator requires a separately reviewed institutional procedure. `pnpm db:seed` is for development/bootstrap rehearsal only, never an existing production database. Remove bootstrap secrets from steady-state service configuration.
6. Run isolated checks before pointing the service at real data:

   ```sh
   pnpm check-types
   pnpm lint
   pnpm test
   pnpm check:secrets
   pnpm audit --audit-level=moderate
   pnpm exec playwright install chromium
   pnpm test:browser
   pnpm build
   pnpm check:production-build
   ```

   On a fresh clone, generate route types with a web build before `check-types`: `pnpm --filter web build`. Browser tests use ports 3100 and 3101 and a fresh isolated real MongoDB namespace; they exercise the actual MongoDB models and transactions; provider delivery and production operations remain separate checks. Follow the [migration runbook](migrations/MONGOOSE_REST.md) for cutover and rollback; complete the operational checks below in staging.

7. Build and install on the same OS/runtime as the service. The server build bundles the workspace code and uses installed Express/Mongoose dependencies; obsolete generated query engines are excluded. Keep the workspace production dependencies available at runtime; the web output is `apps/web/dist` and the API entry is `apps/server/dist/index.mjs`.
8. Create `UPLOAD_DIR` owned only by the application account, outside static roots. Mount it persistently and encrypt backups. Private evidence defaults to local storage if Drive is unavailable. Set disk quotas and capacity alerts. imgBB is for intentionally public profile photos; never put private employment evidence there. Drive uploads stay private and are downloaded through the authorized API.

## HTTPS and process configuration

Run the API from `apps/server` with `pnpm start` under a service manager. Load runtime secrets before starting. The service must restart on failure and forward sanitized logs to the operational logging system. Do not use the Vite development server as the public production server.

An example Caddy route layout, requiring operator installation/configuration of Caddy and real DNS, is:

```caddyfile
alumni.example.org {
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

When deployment is separately authorized, validate proxy configuration and HTTPS. Use the same origin for `CORS_ORIGIN`, `APP_URL`, and `VITE_SERVER_URL`; this keeps raw auth/file URLs and session cookies coherent. Restrict direct API network access to the proxy. Set a proxy request limit consistent with the API's 10 MB file limit plus multipart overhead. Configure gateway-level abuse limits: account counters and production-default IP counters are shared in MongoDB, and accept forwarded client addresses only from an explicitly trusted exact proxy IP with one overwritten X-Forwarded-For address. Otherwise clients behind one proxy share its socket budget. Development IP counters default to process memory. The application intentionally does not trust arbitrary forwarded IP headers.

Administrators require the local TOTP factor even after Google sign-in. Review [account security operations](operations/ACCOUNT_SECURITY.md) for enrollment, key backup, recovery, cookie transition, password policy and cleanup requirements. The local recovery CLI refuses production; do not treat it as the production break-glass process. Real backup/restore and credential/key rotation require operator approval and rehearsal.

Set a site-specific Content Security Policy at the static host after testing Google sign-in/reCAPTCHA. The API supplies standard security headers and no-store responses. Web build commands now force production mode in their child process, preserving private development settings. Verify artifacts with `pnpm check:production-build`. Do not expose internal service ports publicly. Cookie-authenticated mutations require the exact configured Origin or a same-origin Referer when Origin is absent; preserve these headers at the proxy. Bearer-only clients do not need a cookie-origin exception.

## Optional integrations

- In Settings > Integrations, enable only configured services. A configured status means variables exist; it does not verify provider access.
- Google sign-in: register the exact `{APP_URL}/api/auth/google/callback` redirect URL and allowed origins. Verify state-cookie rejection, verified email handling, disabled accounts, and successful sign-in in staging. Verified Google email can link an existing account only after its password registration email was confirmed; pending unconfirmed password reservations remain blocked.
- reCAPTCHA: use a v2 checkbox site/secret key pair registered for the deployed hostname. The browser renders the provider widget and the server verifies its token. The local checkbox is development-only; production rejects that fallback. If reCAPTCHA is enabled without keys, sign-in fails until keys are configured or an administrator disables the integration.
- Drive: enable Drive API, share only the private evidence folder with the service account, and verify upload plus authenticated download. Do not make the folder public. Local fallback requires persistent space even when Drive is configured.
- Sheets: enable Sheets API and share only the designated sheet with the service account. Verify import and RAW-value export. Existing reads are limited to A1:Z1000; schedule larger imports manually until pagination is implemented.
- Forms: defaults off. Configure POST `/api/integrations/google-forms/webhook` with `x-webhook-secret` and a stable 16–128-character `Idempotency-Key` per response/version; all environments reject missing server secrets. Apply the additive FormsReceipt unique index before enablement. Run local transactional replay/concurrency/rollback checks, then verify real sender retry/ordering and ingress/retention policy in staging. Keep disabled until authorized acceptance. See [Forms contract](operations/FORMS_WEBHOOK.md).
- Email: configure the HTTPS gateway and sender. Run Send test in Settings and confirm actual receipt. A successful HTTP response is not proof of delivery.
- imgBB: verify public-photo use is permitted by the institution before enabling it.

## Release smoke tests and recovery

1. Confirm `/health/live` returns 200 and `/health/ready` returns 200 only with a writable MongoDB primary and enabled/configured mandatory contact-verification providers. A 503 readiness response must keep the service out of rotation.
2. Sign in using the privately initialized administrator. Confirm public signup is disabled in production by default. If explicitly permitted by policy, new accounts receive Alumni self-service access, never administrator access. New Google users must also be pre-provisioned unless public signup is enabled. Confirm Settings navigation, profile update, password change, and other-session revocation.
3. Exercise role masters, mixed states, individual permissions, save/reload, concurrent browser saves, and simulated failures against an isolated staging replica set. Verify protected administrator records cannot be disabled, stripped of roles, or have their role permissions cleared through the API.
4. Use a low-privilege staging account to verify forbidden API responses independently of hidden navigation. Verify anonymous/disabled users cannot upload, preview, or download evidence. Verify evidence URLs and storage keys are absent from alumni API responses.
5. Upload allowed synthetic files, reject spoofed and oversized files, then verify an authorized download. Signature checking is not malware scanning. Institution-specific malware scanning, storage quotas, and retention/purge jobs require operational decisions and are not implemented by this release.
6. Confirm desktop/mobile layouts and keyboard access. Automated axe checks cover Settings role and integration pages; arrange screen-reader and broader workflow checks before declaring full WCAG conformance.
7. Schedule database snapshots and upload-volume backups with encryption and restricted access. Restore both into a separate environment and verify role assignments, evidence references, and downloads. Record restore time, recovery point, and recovery time objectives.
8. Monitor readiness, 5xx/403/429 rates, disk growth, database latency, audit-log growth, and external-provider failures. Never log tokens, passwords, private keys, file contents, or full provider responses.
9. For application rollback, redeploy the previous built commit together with its matching lockfile and dependencies. This migration does not mass-revoke sessions. Its structured-name and ownership fields are additive; do not restore an old database over new user data as a routine rollback. If data restoration is necessary, stop writes, take a final backup, obtain operational approval, then restore matched database and upload snapshots.
10. Remove bootstrap password variables from the steady-state service environment after initialization. Review account/role changes and dependency advisories regularly. Run the recorded gates on every dependency or permission change.

## Remaining operational verification

- Verify transactions, unique ownership, concurrent updates and Forms replay/rollback in isolated MongoDB namespaces. Production topology, failover and restoration require separate acceptance.
- Deployment host, domain, proxy, persistent volume, monitoring and restore drills require operator verification.
- External-provider OAuth, mail, Drive, Sheets and Forms sender behavior require credentials and staging acceptance. SMS delivery is unimplemented; strict accounts remain restricted and production readiness returns 503 until the provider adapter is completed and accepted. Keep unverified integrations disabled.
- Malware scanning, retention/purge policy and multi-instance shared file storage require institutional decisions. Pagination is implemented; deep-offset performance and real capacity remain unverified.
- Verify the intended release in hosted Windows/Linux CI and on a physical second device; local results alone do not establish either.

Local checks do not establish production readiness.

## Mongoose and REST cutover

Read [the migration runbook](migrations/MONGOOSE_REST.md) before applying any changes. Existing collection names, ObjectIds, references, timestamps and records are retained; unrelated indexes remain intact. Automatic index creation is disabled at server startup. First inspect the target using the DB package's `db:migrate --dry-run`, back up the database and private uploads, review conflicts, and obtain operator authorization before `--apply`. Apply adds absent collections/indexes and retires only the reviewed legacy `Department_code_key` after saving its full definition in `MigrationIndexBackup`. It never rewrites names, links accounts, resets records or reseeds an existing database. Review the runbook before rollback: restoring that index can be blocked by duplicate or missing department codes. The partial unique `User.alumniId` index and FormsReceipt uniqueness must be present before enabling corresponding traffic. Run `db:verify-transactions` against the approved isolated environment before cutover.

Repository seeding now explicitly refuses `NODE_ENV=production`; provisioning a new production administrator requires a separately reviewed institutional process. The migration preserves existing administrators and passwords. Development bootstrap commands must not be used to alter an existing production database.

Only `/api` REST endpoints are served. Retired `/rpc` and `/api-reference` endpoints return 404. Serve static SPA fallback routes including `/my-profile`; preserve Origin/Referer and cookie headers. Staff and Alumni are exempt from mandatory MFA in every environment; Administrator roles retain the strongest policy even when combined with other roles.

## Verification enablement gate

Production must leave `LOCAL_REQUIRE_EMAIL_VERIFICATION` and `LOCAL_REQUIRE_PHONE_VERIFICATION` true or absent; false is rejected at startup. LOCAL_DISABLE_MFA must be false/absent in production; a local testing pause is rejected. Verify a real SMS adapter, enabled HTTPS email gateway and actual receipt/code-expiry behavior in isolated staging. Readiness intentionally stays 503 while these mandatory capabilities are incomplete; do not weaken it to deploy. Review grandfathered `verificationRequired=false` accounts and old Staff integration grants with an explicit institutional migration plan rather than silently changing their access.

Record target-specific acceptance before provider activation, production schema changes or deployment. Passing local checks is insufficient authorization or evidence of operational readiness.
