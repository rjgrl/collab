# Development setup

Local functionality testing uses `LOCAL_REQUIRE_EMAIL_VERIFICATION=false` and `LOCAL_REQUIRE_PHONE_VERIFICATION=false` in the private server environment. Both default to `true`; exemptions are accepted only with `NODE_ENV=development` or `test` and a named loopback MongoDB database on port 27018, replica set rs0. Restart the API and refresh after changes. Contacts remain unverified, and no verification codes are fabricated. Set both to `true` (or remove them) and restart to restore strict gates for verification-required accounts. For local testing, set `LOCAL_DISABLE_MFA=true`: Administrator enrollment/challenge is paused only in managed loopback development. Setup supplies this local default; set it false/remove it and restart to restore normal Admin MFA. Production rejects true. Existing factors/recovery codes are preserved and sessions are not falsely marked MFA-verified. Staff and Alumni never have mandatory MFA.

The optional `pnpm test:clone-local` harness additionally requires Chromium (`pnpm exec playwright install chromium`), Git on PATH, free ports 3200/3201 and the testing branch committed locally. It retains private clone/log artifacts and synthetic databases. It does not publish the branch or replace a physical laptop test. Normal app setup has no Playwright or Database Tools prerequisite.

Install Git, Node 26.10.0 (`.node-version`), pnpm 12.5.1 (`npm install --global pnpm@12.5.1`) and MongoDB Community Server. Supported runtimes are Node 22.18+, 24.11+, or 26+; the pinned version is the tested team baseline. Compass is optional inspection software, not the MongoDB server. Docker, Atlas, mongosh and provider credentials are unnecessary for local core workflows. Use MongoDB's supported installer for your OS/CPU; Windows MongoDB 9.0.2 is the measured environment, other OS versions remain pending.

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

Open http://localhost:3001; API port 3000, loopback MongoDB port 27018, replica set rs0. Initial downloads need network access. Default setup omits demo records; `--demo` adds clearly synthetic records when initializing a fresh database. No SMS, mail or Google credentials are required for the seeded local administrator.

Setup creates only missing private environment values and chooses a random `collab_dev_...` database per checkout. Do not copy another checkout's environment, credentials, data directory, node_modules or build artifacts. Existing custom/remote database URLs and production environments are refused. A shared local MongoDB process can host distinct checkout databases; never reconfigure another replica set to make setup work.

Read your generated login privately from `.tools/local-login.txt`. Sign in and complete the local CAPTCHA if shown. With LOCAL_DISABLE_MFA=true, no authenticator is needed locally. When re-enabling MFA, enroll TOTP and save recovery codes privately. Normal MFA applies to Administrator roles, including mixed-role accounts; Staff and Alumni do not require it. Local setup fills missing contact-policy flags with false for functionality tests. Existing nonempty values are preserved; strict verification still requires approved providers. Public signup needs ALLOW_PUBLIC_SIGNUP=true. Keep optional integrations disabled. Never share login files, recovery codes or encryption keys through Git.

After a pull, stop this checkout's app, install with the frozen lockfile, run setup and doctor. A populated database receives no automatic schema/seed update. If setup identifies a schema gap, back it up, review schema/seed changes and explicitly run `pnpm setup:local --update-existing`. This command can update permissions/indexes and seed defaults; it is not a production migration or data-loss bypass. `--demo` alone does not add demo rows to an existing database. Never add `--accept-data-loss`, run migrate reset or delete data to clear errors.

`pnpm run doctor` checks versions, files, IPv4 port availability, directory access, credential presence (booleans only), database connection, writable primary and selected seed/index invariants. It sends no provider messages and does not change the database. A successful doctor is not full application acceptance. `pnpm setup:local` additionally checks real transaction rollback.

For checks: `pnpm --filter web build`, `pnpm check-types`, `pnpm test:browser-types`, `pnpm exec vp lint --deny-warnings`, `pnpm test`, `pnpm check:secrets`, `pnpm build`, `pnpm check:production-build`, `pnpm check:server-build`. Browser tests require `pnpm exec playwright install chromium`; fixtures use ports 3100/3101 and synthetic data. Real-DB security runners create their own disposable namespaces. Database Tools are needed only for recovery rehearsals; see [recovery](operations/DISASTER_RECOVERY.md).

Each laptop should run its own loopback instance. LAN sharing is opt-in and requires an explicit network/authentication/TLS review; changing HOST alone is insufficient because CORS, cookies, browser origin and firewall rules must agree. Never expose the unauthenticated development MongoDB server. No staging provisioning or deployment is performed by setup.

Current architecture and database cutover instructions: [migration runbook](migrations/MONGOOSE_REST.md). Existing names, ObjectIds and records are preserved; migration is dry-run by default.
