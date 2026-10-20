# Development setup

Optional local convenience: `LOCAL_DISABLE_MFA=true` in the private server .env pauses authenticator requirements for every account only when `NODE_ENV=development`. Restart the API and refresh the browser. Existing enrollment/recovery codes stay saved, and password/RBAC/verification checks remain. Set it to false or remove it and restart to resume MFA. The committed default enforces MFA, tests keep exercising it, and production startup rejects the bypass flag.

The optional `pnpm test:clone-local` harness additionally requires Chromium (`pnpm exec playwright install chromium`), Git on PATH, free ports 3200/3201 and the testing branch committed locally. It retains private clone/log artifacts and synthetic databases. It does not publish the branch or replace a physical laptop test. Normal app setup has no Playwright or Database Tools prerequisite.

Install Git, Node 26.10.0 (`.node-version`), pnpm 12.5.1 (`npm install --global pnpm@12.5.1`) and MongoDB Community Server. Node 22.15+ is the minimum; the pinned version is the tested team baseline. Compass is optional inspection software, not the MongoDB server. Docker, Atlas, mongosh and provider credentials are unnecessary for local core workflows. Use MongoDB's supported installer for your OS/CPU; Windows MongoDB 9.0.2 is the measured environment, other OS versions remain pending.

Corepack is not bundled starting with Node 25 ([Node documentation](https://nodejs.org/download/release/v25.8.0/docs/api/corepack.html)). The tested Node 26 environment has no Corepack executable, so the direct pinned pnpm installation above is the simplest path. If your managed Node installation already includes a maintained Corepack, `corepack enable` can provide shims; verify `pnpm --version` resolves 12.5.1. Do not install competing shims or change PowerShell security policy to bypass installation errors. All other CLIs are repository dependencies.

```sh
git clone https://github.com/rjgrl/collab.git
cd collab
git switch development/phase6-cross-device-testing
pnpm install --frozen-lockfile
pnpm setup:local --demo
pnpm run doctor
pnpm dev
```

The testing branch is published with owner approval; main has not been merged and does not contain Phase 6. Open http://localhost:3001; API port 3000, loopback MongoDB port 27018, replica set rs0. Initial downloads need network access. Default setup omits demo records; `--demo` adds clearly synthetic records when initializing a fresh database. No SMS, mail or Google credentials are required for the seeded local administrator.

Setup creates only missing private environment values and chooses a random `collab_dev_...` database per checkout. Do not copy another checkout's environment, credentials, data directory, node_modules or generated client. Existing custom/remote database URLs and production environments are refused. A shared local MongoDB process can host distinct checkout databases; never reconfigure another replica set to make setup work.

Read your generated login privately from `.tools/local-login.txt`. Sign in, complete the local CAPTCHA if shown, then enroll TOTP using the account password and save recovery codes privately. MFA remains required. New public signup remains restricted until approved verification providers work; SMS is intentionally disconnected. Keep optional integrations disabled. Never share login files, recovery codes or encryption keys through Git.

After a pull, stop this checkout's app, install with the frozen lockfile, run setup and doctor. A populated database receives no automatic schema/seed update. If setup identifies a schema gap, back it up, review schema/seed changes and explicitly run `pnpm setup:local --update-existing`. This command can update permissions/indexes and seed defaults; it is not a production migration or data-loss bypass. `--demo` alone does not add demo rows to an existing database. Never add `--accept-data-loss`, run migrate reset or delete data to clear errors.

`pnpm run doctor` checks versions, files, IPv4 port availability, directory access, credential presence (booleans only), database connection, writable primary and selected seed/index invariants. It sends no provider messages and does not change the database. A successful doctor is not full application acceptance. `pnpm setup:local` additionally checks real transaction rollback.

For checks: `pnpm --filter web build`, `pnpm check-types`, `pnpm test:browser-types`, `pnpm exec vp lint --deny-warnings`, `pnpm test`, `pnpm check:secrets`, `pnpm build`, `pnpm check:production-build`, `pnpm check:server-build`. Browser tests require `pnpm exec playwright install chromium`; fixtures use ports 3100/3101 and synthetic data. Real-DB security runners create their own disposable namespaces. Database Tools are needed only for recovery rehearsals; see [recovery](operations/DISASTER_RECOVERY.md).

Each laptop should run its own loopback instance. LAN sharing is opt-in and requires an explicit network/authentication/TLS review; changing HOST alone is insufficient because CORS, cookies, browser origin and firewall rules must agree. Never expose the unauthenticated development MongoDB server. No staging provisioning or deployment is performed by setup.
