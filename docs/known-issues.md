# Known issues and gotchas

Format: symptom, cause, workaround. Remove an entry when it is fixed.

- `docs/` is an allowlist in `.gitignore`. A new doc stays untracked until it gets a `!/docs/<file>` entry.
- Only `.claude/agents/` and `.claude/skills/` are tracked. New shared Claude config elsewhere under `.claude/` needs its own `!` entry in `.gitignore`.
- The GateGuard hook blocks the first Bash call of each session until the request and the command's purpose are stated. Workers will hit it too: state both, then retry.
- Local MongoDB runs on port 27018 as a replica set, not on 27017. Transactions need the replica set.
- Every browser test fails with `browserType.launch: Executable doesn't exist` on a fresh machine. Cause: Playwright's Chromium is not installed. Workaround: `pnpm exec playwright install chromium` once per machine.
- Browser tests and `*-local.ts` checks fail with `ECONNREFUSED 127.0.0.1:27018` after a reboot. Cause: the local replica set is not running. Workaround: `pnpm db:local` (it starts a detached `mongod`).
- `pnpm exec vp fmt <directory>` can hang on Windows. Workaround: pass individual files.
- Scripts that write files in text mode on Windows (for example Python's `open(p, "w")`) produce CRLF and `pnpm check` reports formatting errors. Workaround: write with LF (`newline=""` in Python); `.gitattributes` normalizes on commit, but the check runs on the working tree.
- New server environment keys. `INTEGRATION_ENCRYPTION_KEY` (64 hex) is required in production and must differ from `MFA_ENCRYPTION_KEY`, `SESSION_SECRET` and `BACKUP_ENCRYPTION_KEY`; `pnpm setup:local` generates it for new checkouts, but existing local `apps/server/.env` files need it added by hand to save integration credentials. Backups need `BACKUP_ENCRYPTION_KEY` (64 hex, distinct), an absolute `BACKUP_DIR` outside `UPLOAD_DIR`, and `MONGODB_TOOLS_DIR`; without them Settings › Backups shows what is missing and backups return 503.
- `mongodump` and `mongorestore` are not part of the MongoDB Server install. Run `pnpm tools:mongodb` for the pinned, checksum-verified Windows/Ubuntu x64 package (see `docs/operations/DISASTER_RECOVERY.md`). Note: `mongodump` has no `--nsExclude`; use `--excludeCollection`.
- Integration credentials are cached per server process for 5 seconds. Test fixtures that mutate their `IntegrationEnv` object at runtime must call `invalidateIntegrationEnvCache()` afterwards, or the next request sees the old values (this caused an SMS verification flake).
- `pnpm test:roles-local` needs `.tools/test-accounts/latest.txt` from `pnpm accounts:local` first.
- Stopping a Playwright run through a background job on Windows can leave its fixture and Vite processes alive on ports 3100/3101; the next run then fails with "already used". Kill the orphaned node processes (not your own `pnpm dev`).
- Editing or deleting files under `apps/web/src/routes` while a Vite dev server or Playwright run is active regenerates `routeTree.gen.ts` without them; `pnpm check` then fails with route type errors. Start Vite once (`pnpm --filter web exec vp dev`) to regenerate.
- CI starts its own MongoDB through `mongodb-memory-server` (`apps/server/test/local/ci-replica-set.ts`) whenever `CI=true`. The version must be a published download: 9.0.0, 9.0.1 and 9.0.3 do not exist, 9.0.2 does. Running a `*-local.ts` script with `CI=true` while `pnpm db:local` is running fails because both want port 27018.
- Integration connection-test mocks must use each provider's real response format (for example reCAPTCHA's `error-codes` with a hyphen). A made-up field once let any reCAPTCHA secret pass.
- Adding a JSON endpoint: add it to `packages/contracts/src/api-routes.ts` (the web client picks it up), mount it under `/api` in Express (`/api/v1` is rewritten there), then run `pnpm openapi`. `pnpm test` fails if the route is missing on the server or the spec is stale. Multipart, download and redirect endpoints go in `RAW_ROUTES`.
