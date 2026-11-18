# Render deployment: one website, one API, Atlas

## Release status and scope

This guide prepares a **single Render Node web service** that serves both `apps/web/dist`
and the Express API. Browsers use one HTTPS origin; API writes go directly to Atlas
`alumni_tracking`. No copying service or dual-write synchronization is involved.

**Production release is currently blocked:** real SMS delivery is not wired in
`packages/api/src/integrations/sms.ts`. Required email/SMS verification must be implemented,
configured and delivery-tested before `/health/ready` can return 200 in production.
Do not deploy this to real users yet, change the health-check path to hide the failure,
set `NODE_ENV=development`, or enable a local verification/MFA bypass to get around it.
Database connectivity at `/health` is not production readiness.

No Render resource, billable upgrade, live service setting or cloud database is changed by
checking this guide or the example configuration into Git. Actual deployment requires the
owner's service-specific authorization, account access, reviewed costs and release checks.
The existing service URL/name and deployment access must be supplied by its owner; never
share an account password or paste tokens/connection strings into chat.

## 1. Review the existing service before changing it

1. Open the existing service in the Render Dashboard and record its public URL, service name,
   linked GitHub repository, branch and current deployed commit. Confirm it is this project.
2. Disable automatic deployments while preparing the change. Keep the current working release
   available. Do not trigger a manual deployment until the release blocker above is resolved.
3. Review the paid compute plan and persistent-disk charges with the owner. Local private
   evidence/photo storage needs a persistent volume; a free ephemeral filesystem is not a
   safe substitute. Keep **one instance**. The example's minimum paid plan is not a capacity
   or performance certification.
4. Select a region near the Atlas primary and the intended users. Do not guess that the current
   Render region and Atlas region match.
5. Prepare a release branch/commit, review it, run the checks below, and push only with approval.
   Local uncommitted changes are not available to Render. Select that exact branch/commit in
   the service; do not assume this workspace's code is already published.

`config/render/render.yaml.example` is a reference, not an auto-applied Blueprint. For an
existing service, use its Dashboard settings. Applying a new Blueprint with a different name
can create a second billable service. Render's `sync: false` entries prompt on initial Blueprint
creation only; they **do not update secrets on an existing Blueprint service**.

## 2. Check Atlas and preserve the migrated data

- Use the existing `alumni_tracking` database, not a new implicit `test` database. The migration
  and reviewed profile refresh are already recorded in `docs/progress.md`.
- Create/use a restricted database user with `readWrite` on `alumni_tracking` only. Database-user
  credentials are separate from an Atlas/Google login.
- Copy the URI privately from the approved Atlas configuration. Its path must explicitly end
  in `/alumni_tracking` before `?`; replace the entire credential placeholder, including its
  brackets, and URL-encode password characters. Keep verified TLS enabled.
- In Atlas Network Access, allow the service's actual outbound IPs/CIDRs shown by Render.
  Review whether a dedicated outbound IP is needed and obtain cost approval first. Do not use
  `0.0.0.0/0`. Remove temporary migration-device access only when operator work is complete.
- Preserve the source `MFA_ENCRYPTION_KEY`, `INTEGRATION_ENCRYPTION_KEY` and `SESSION_SECRET`
  exactly. Do not generate replacements for migrated encrypted data. Preserve an older backup
  encryption key separately if it is needed to restore existing `.atsbak` files.
- Back up Atlas and any private uploads immediately before the final cutover. Reconcile any
  newly approved local business changes first; the snapshot is not ongoing synchronization.
- **Do not run `setup:local`, development seeding, `deploy:init`, `mongorestore --drop`, or an
  automatic schema migration against this populated database.** Apply a migration only after
  a fresh dry run and separate target-specific approval.

## 3. Configure private and public environment values

Use Render's Environment editor. Keep filled environment files out of Git. The templates are
`apps/server/.env.production.example` and `apps/web/.env.production.example`.

Required runtime/build values:

- `NODE_VERSION=26.10.0` and `NODE_ENV=production`.
- `HOST=0.0.0.0`. Render supplies `PORT`; leave it managed by Render. The application fallback
  is 5000 if no port is provided.
- `SERVE_WEB=true`.
- `MONGO_URI`: the private authenticated, verified-TLS URI selecting `alumni_tracking`.
- Leave `DATABASE_URL` unset. Legacy tooling still supports it, but if both variables are
  nonempty they must be **identical**, including options. Conflicts fail instead of choosing
  a different database silently.
- `APP_URL`, `CORS_ORIGIN`, and build-time `VITE_SERVER_URL`: the **same exact** public HTTPS
  origin, for example `https://your-real-service.onrender.com`, without a trailing slash,
  path, credentials or query. Use the real Dashboard URL, not this example.
- `UPLOAD_DIR=/var/data/uploads`, with a persistent disk mounted at `/var/data`.
- Existing private `SESSION_SECRET`, `MFA_ENCRYPTION_KEY`, `INTEGRATION_ENCRYPTION_KEY`.
- `STAFF_EMAIL_DOMAINS=buksu.edu.ph,student.buksu.edu.ph`, or another separately approved
  institutional policy. Verify that the intended existing Super Admin can sign in under it.
- `AUTH_IP_STORE=mongodb`; preserve reviewed authentication budgets.
- `ALLOW_PUBLIC_SIGNUP=false` unless institutional access policy explicitly permits signup.
- `LOCAL_DISABLE_MFA=false`, `LOCAL_REQUIRE_EMAIL_VERIFICATION=true`, and
  `LOCAL_REQUIRE_PHONE_VERIFICATION=true`. Never copy local bypass settings to Render.

`VITE_*` values are public browser-build data: **never put a database URI, password, token or
encryption key in them**. Provider credentials in production are encrypted integration
settings; old development provider environment values are not a substitute for configuring
Settings > Integrations. SMS still needs its real adapter and delivery acceptance.

Leave `TRUSTED_PROXY_IPS` empty until exact ingress peers and a single-address
X-Forwarded-For overwrite policy are verified. Do not set `trust proxy=true`, trust arbitrary
forwarded headers, reuse outbound IPs as ingress trust, or disable IP budgets. Until this is
reviewed, users behind an untrusted Render proxy share its socket-IP authentication budget;
capacity and ingress policy remain operational acceptance items.

## 4. Exact Render build and start settings

Keep the service **Root Directory blank** (repository root); pnpm needs the whole workspace.
Set runtime/language to Node. Install build-time dev dependencies explicitly even though the
service's `NODE_ENV` is production. These commands pin pnpm without requiring a globally
installed pnpm or a bundled Corepack:

**Build Command** (one line):

```sh
npm exec --yes --package=pnpm@12.5.1 -- pnpm install --frozen-lockfile --prod=false && npm exec --yes --package=pnpm@12.5.1 -- pnpm env:generate && npm exec --yes --package=pnpm@12.5.1 -- pnpm build
```

**Start Command**:

```sh
umask 077 && cd apps/server && node dist/index.mjs
```

Equivalent workspace start, when the pinned pnpm is installed and on PATH:

```sh
pnpm --filter server start
```

**Health Check Path**: `/health/ready`.

The build produces `apps/web/dist/index.html` and `apps/server/dist/index.mjs`. With
`SERVE_WEB=true`, a missing build stops startup instead of serving fake data. The static server
serves only the compiled web tree, preserves API 401/403/404 responses, excludes private
upload and retired API/RPC paths, and rejects symlinked assets. Private storage must not overlap
the public web build. Do not expose a Vite dev server as production.

With a disk, Render cannot scale this service to multiple instances or perform its normal
zero-downtime swaps. Schedule the brief restart/cutover window with the owner. The disk is
available at runtime, not in build/pre-deploy/one-off job environments; don't run upload-volume
migration or restore work from a phase where the volume isn't mounted.

## 5. Checks before an authorized deployment

Run these in a clean local checkout with native MongoDB, not Atlas:

```sh
pnpm install --frozen-lockfile
pnpm env:generate
pnpm db:local
pnpm check
pnpm test
pnpm test:browser-types
pnpm exec playwright test tests/browser/server-persistence.spec.ts
pnpm build
pnpm check:hosting-local
pnpm check:server-build
pnpm check:production-build
pnpm check:secrets
```

`check:hosting-local` starts the compiled server with a fresh native-only MONGO_URI namespace,
synthetic configuration and compiled web assets. It verifies API protection and database
selection, then removes only its own temporary namespace/files. It does not test Atlas or prove
production readiness.

On Windows, Node 24.15.0 was observed aborting inside Varlock's child-process shutdown with
`UV_HANDLE_CLOSING`. The compiled check passes on the project's pinned Node 26.10.0. Use that
runtime; do not suppress validation or skip the check. A temporary pinned-runtime invocation
that does not change your global Node installation is:

```sh
npm exec --yes --package=node@26.10.0 -- node node_modules/tsx/dist/cli.mjs scripts/check-hosting-local.ts
```

The check's `_VARLOCK_THROW_ON_LOAD_ERROR` setting changes error reporting only, not validation.
The known Windows 24.15.0 combination fails early with guidance rather than crashing.

The local development commands `pnpm dev` / `pnpm dev:server` keep port 3000 explicitly;
restart an already-running development command after changing listener configuration.
The frontend remains on local Vite port 3001. Local browser fixtures use isolated native
namespaces on 27018, not the cloud database or a shared development namespace.

On the approved host/staging target, load its private environment and run non-destructive
migration inspection before enabling traffic:

```sh
pnpm --filter @Alumni-Tracking-Ss/db db:migrate --dry-run
pnpm --filter @Alumni-Tracking-Ss/db db:check-references
```

A separately approved rollback-only transaction probe verifies real write/rollback support:

```sh
pnpm --filter @Alumni-Tracking-Ss/db db:verify-transactions
```

Do not call the root local-development wrapper against an unspecified cloud target, run tests
against Atlas, or paste URI values into shell history. Use the service's secret environment.
Check indexes, role migrations, account domains, TOTP enrollment/recovery, provider delivery,
proxy budgets, backups and restore drills. **Stop if production readiness is 503.**

## 6. Deploy and verify, only after all release gates are satisfied

1. Obtain approval for this service, commit, environment, cost and maintenance window.
2. Set the reviewed environment, commands, disk and readiness path on the existing service.
   Trigger a manual deploy of the verified commit, keeping automatic deployments off.
3. Verify these public probes:
   - `/health/live`: process liveness, 200.
   - `/health`: live process plus writable replica-set connection, 200 when connected.
   - `/health/ready`: database **and** required contact-verification readiness, 200 only when
     production prerequisites are met. Render requires a successful response within five seconds.
4. Open the **hosted website URL**, sign in, enroll/verify Super Admin TOTP if required, and
   check the intended least-privilege users. Confirm localhost is not the website being tested.
5. With approved test records, create/edit/archive an alumni record and add/edit/remove an
   employment entry. Confirm immediate UI refresh, persisted API reads after reload, and the
   matching Atlas `alumni_tracking` records. Verify that denied/failed writes never report a
   saved local fallback, private evidence still requires authorization, and no test account has
   access to real alumni beyond its assigned scope.
6. Confirm uploaded files survive an authorized restart/redeploy, public photo policy is correct,
   and encrypted backups/restore work. Existing demo/test accounts were explicitly retained;
   review their credentials, scopes and institutional eligibility before public release. Do not
   silently delete or enable them.
7. Record provider acceptance and remove temporary deployment secrets/permissions when done.

All hosted CRUD then goes directly through the API to Atlas. **Edits made on the separate
localhost development website remain local.** This preparation does not enable background
replication or push notifications between different browsers. Successful mutations already
invalidate/refetch active server-backed UI queries.

## Optional in-app backups

If enabling in-app backups, install the pinned native tools during the build with
`pnpm tools:mongodb`, set an independent 64-hex `BACKUP_ENCRYPTION_KEY`, set
`BACKUP_DIR=/var/data/backups`, and set `MONGODB_TOOLS_DIR` to the installed Linux tools' absolute
`bin` path. Keep keys in the service secret/recovery store, not in database records or the
public build. Verify tools/runtime compatibility and actual restore on an isolated target.
Do not treat local ACL-restricted `.archive.gz` operator copies as encrypted `.atsbak` bundles.

## Rollback

Keep the prior release commit and pre-cutover database/upload snapshots. If deployment fails
readiness, do not override the health gate. Roll back application code/configuration to the
last accepted release without overwriting new Atlas writes. Database restoration is a separate,
approved operation requiring a new backup and a paused-write window. Writes made in Atlas are
not copied back to local MongoDB automatically.

## Provider references

Provider settings were checked against these official pages; verify current plan pricing and
account-specific capabilities before applying them:

- [Express deployment](https://render.com/docs/deploy-node-express-app)
- [Monorepo support](https://render.com/docs/monorepo-support)
- [Blueprint syntax](https://render.com/docs/yaml-spec)
- [Node version selection](https://render.com/docs/node-version)
- [Persistent disks](https://render.com/docs/disks)
- [Health checks](https://render.com/docs/health-checks)
- [Outbound addresses](https://render.com/docs/outbound-ip-addresses)
