# Alumni Tracking System

A role-based Alumni tracking application built with React/Vite, TanStack Router/Query, Express REST, Mongoose, and MongoDB. Alumni register and maintain their academic/employment profile; Staff review evidence and tracking decisions; Super Admins manage accounts, permissions, audit logs and integrations.

The team setup runs a separate database on each laptop/desktop. No Atlas account, shared database password, Docker, or Google credentials are required for local functionality testing.

## Install once on each device

| Requirement       | What to install                                                                                                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git               | [Git installer](https://git-scm.com/downloads)                                                                                                                                                                              |
| Node.js           | Node **26.10.0** is the tested version, recorded in `.node-version`. The project requires Node 22.18+, 24.11+, or 26+; use the tested version for consistent team results. [Node downloads](https://nodejs.org/en/download) |
| pnpm              | Install **12.5.1** after Node: `npm install --global pnpm@12.5.1`                                                                                                                                                           |
| MongoDB Server    | [MongoDB Community Server](https://www.mongodb.com/docs/manual/administration/install-community/), including `mongod`. **MongoDB 9.0 is tested.** Use an installer supported by your OS/CPU.                                |
| MongoDB Compass   | [Compass](https://www.mongodb.com/try/download/compass), for viewing/editing the local test database                                                                                                                        |
| Authenticator app | A TOTP authenticator supporting six-digit, 30-second codes; required for administrator accounts. Manual setup keys and recovery codes are supported.                                                                        |

**Compass is the database GUI; it does not replace MongoDB Server.** Install both. The app connects to the same server that you open in Compass. The application requires a replica set for transactions, even when there is only one local server. The committed scripts initialize that replica set automatically.

On Windows, MongoDB's standard installation directory is detected automatically, even if `mongod` is not on PATH. You may leave the installer's Windows service option unchanged: this project uses a separate background process on port **27018**, avoiding the usual service on 27017. On macOS/Linux, install the Community Server using MongoDB's OS-specific instructions and make `mongod` available on PATH (`mongod --version` should work).

Restart your terminal after installing Node/pnpm or changing PATH. Initial dependency installation needs internet access. Native MongoDB binaries are installed per device and are not committed to Git.

## First run after cloning

```sh
git clone --branch development/phase6-cross-device-testing --single-branch https://github.com/rjgrl/collab.git
cd collab
pnpm install --frozen-lockfile
pnpm setup:local
pnpm run doctor
pnpm dev
```

Open **http://localhost:3001**. The API runs on **http://localhost:3000**. Keep the terminal running while testing; Ctrl+C stops the application.

`pnpm setup:local` performs these steps in order:

1. Creates missing `apps/server/.env`, `apps/web/.env`, and `packages/db/.env` values for local testing. Existing nonempty values are preserved.
2. Generates a unique initial administrator password on that device and saves the login privately in **`.tools/local-login.txt`**. Open that file to get your email/password; do not commit or share it.
3. Generates environment types. Mongoose models are ordinary TypeScript; no generated database client or native query engine is required.
4. Starts MongoDB on loopback port 27018, initializes replica set **rs0**, and waits until it has a writable primary.
5. Initializes a new, randomly named database for this checkout, adds missing Mongoose collections/indexes without removing records or indexes, then seeds permissions, roles and the local administrator. An existing populated database is verified without schema/seed writes; updates require explicit `--update-existing` after review and backup.
6. Checks the administrator account and performs a real MongoDB transaction/rollback probe, so replication failures are caught before you start the app.

For sample departments and three synthetic alumni, use **`pnpm setup:local --demo`** instead of `pnpm setup:local`. Normal setup creates an administrator; configure departments/programs and let Alumni self-register. Admins create Staff or Super Admin accounts through Members. Development sign-in may show an "I am not a robot" checkbox; tick it before submitting. Real reCAPTCHA/Google/provider keys are optional and should never be copied between machines through Git.

There is no shared, hardcoded administrator password. Changing a password in Account settings does not cause setup to reset it. If you rerun setup after changing it, use the current password; the initial-login file may contain the original password.

With normal MFA enforcement enabled, Administrators enroll an authenticator after signing in, before accessing protected pages or APIs. Local testing currently pauses that requirement. Enter the current password, add the displayed key to your authenticator, confirm its code, and save the one-time recovery codes privately. Setup generates missing encryption/verification keys per device. For enrollment, local lost-authenticator recovery, password resets and configuration details, see [account security operations](docs/operations/ACCOUNT_SECURITY.md).

## Run again, or update after a pull

Local functionality testing uses `LOCAL_REQUIRE_EMAIL_VERIFICATION=false` and `LOCAL_REQUIRE_PHONE_VERIFICATION=false` in the private server environment. Both default to `true`; exemptions are accepted only with `NODE_ENV=development` or `test` and a named loopback MongoDB database on port 27018, replica set rs0. Restart the API and refresh after changes. Contacts remain unverified, and no verification codes are fabricated. Set both to `true` (or remove them) and restart to restore strict gates for verification-required accounts. For local testing, set `LOCAL_DISABLE_MFA=true`: Administrator enrollment/challenge is paused only in managed loopback development. Setup supplies this local default; set it false/remove it and restart to restore normal Admin MFA. Production rejects true. Existing factors/recovery codes are preserved and sessions are not falsely marked MFA-verified. Staff and Alumni never have mandatory MFA.

For ordinary daily use, including after reboot:

```sh
pnpm dev
```

The development command checks the local MongoDB replica set and starts it if needed before launching the web/API apps. You do not need to run `rs.initiate()` in Compass or install `mongosh`.

After pulling team changes:

```sh
git pull
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev
```

Stop this checkout's development servers before pulling/installing/generating on Windows. Setup preserves local configuration and existing account passwords; populated databases are verified without schema/seed updates. If schema changes are needed, back up local data, review the changes, then run `pnpm setup:local --update-existing`. If index inspection reports a conflict, setup stops. Review `pnpm db:migrate --dry-run` and a backup before authorizing `pnpm db:migrate --apply`; never delete data or drop an index to bypass the report.

This update adds the `AccountPhoto` collection and its user/date index. For an existing database, run `pnpm db:migrate --dry-run`, review the plan and back up your data, then run `pnpm setup:local --update-existing` (or `pnpm db:migrate --apply`). The migration adds missing collections/indexes without deleting existing records. Department codes are absent from the active model, forms and API; legacy stored fields/indexes are not destructively removed.

## Connect using MongoDB Compass

1. Run `pnpm setup:local` or `pnpm dev` so the server is running.
2. Open Compass, choose **Add new connection**, and paste:

   ```text
   mongodb://127.0.0.1:27018/?replicaSet=rs0
   ```

3. Connect and open the database named in your private `apps/server/.env` (`collab_dev_` plus a random suffix for new clones). Existing configured database names are preserved. Collections include `User`, `Role`, `Permission`, `Alumni`, `Department`, `Program`, `Employment`, `EvidenceFile`, `AccountPhoto`, `Notification` and `AuditLog`.

The application's generated local server environment uses:

```dotenv
DATABASE_URL=mongodb://127.0.0.1:27018/collab_dev_<generated-suffix>?replicaSet=rs0
```

Closing Compass does not stop MongoDB. Closing the application terminal leaves the local database process running for Compass and future app starts. Database files persist in **`.tools/mongodb-rs0/data`**; logs are in **`.tools/mongodb-rs0/mongod.log`**. Do not delete that directory unless you deliberately intend to discard that local database. This loopback-only, single-node, unauthenticated setup is for local testing, not public hosting or real confidential alumni records.

## What teammates get from Git

Committed: all source packages, workspace manifests, pinned pnpm lockfile, Mongoose models, additive index migration, seed logic, environment schemas/examples, native MongoDB discovery/startup and replica initialization scripts, setup/verification scripts, and documentation. Database models run directly from the TypeScript package.

Ignored deliberately: real `.env` files, per-device passwords, MongoDB data/logs, uploads, `node_modules`, obsolete generated database artifacts, build outputs, and test traces. `pnpm install` and `pnpm setup:local` recreate the required local dependencies/config/environment types. Team changes to database records are **not** synchronized by Git; commit synthetic seed changes if everyone needs the same sample data.

Do not copy another person's `node_modules`, build output, `.tools`, or `.env` files into your clone. Do not overwrite your local environment with examples on every pull.

## Troubleshooting

Start with `pnpm run doctor` (read-only; credentials are never printed). See the [development setup](docs/DEVELOPMENT_SETUP.md), [Windows guide](docs/WINDOWS_SETUP.md), and [troubleshooting guide](docs/TROUBLESHOOTING.md). `pnpm setup:dev` is an alias for `pnpm setup:local`.

| Symptom                                                                | Action                                                                                                                                                                                                            |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm` or `node` not recognized                                        | Install the versions above, restart the terminal, and check `node --version` / `pnpm --version`.                                                                                                                  |
| `Install MongoDB Server` / `mongod` missing                            | Compass alone is insufficient. Install Community Server; on macOS/Linux put `mongod` on PATH. On Windows keep the standard installation directory.                                                                |
| Connection refused at 27018                                            | Run `pnpm db:local`; inspect `.tools/mongodb-rs0/mongod.log` if it exits. Normal `pnpm dev` also runs this check.                                                                                                 |
| `ReplicaSetNoPrimary` or transaction/replica-set errors                | Run `pnpm db:local` and wait for `rs0 is PRIMARY`. Check that your private URL includes `?replicaSet=rs0` and port 27018, rather than a standalone server on 27017.                                               |
| Another server owns port 27018 / a different replica set               | The helper refuses to reconfigure unmanaged data. Inspect that process/config before changing it; do not force `rs.reconfig()` or delete directories.                                                             |
| Missing Mongoose dependency / route types                              | Run `pnpm setup:local`. For standalone typechecks on a fresh clone, first run `pnpm --filter web build` to generate route types.                                                                                  |
| MongoDB upgraded/moved after a previous setup                          | The saved binary path is intentionally pinned for existing data. Restore the binary or plan a proper MongoDB upgrade; the helper does not automatically upgrade existing database files.                          |
| Setup refuses a custom/remote `DATABASE_URL` or production environment | Your existing values were preserved. Use [manual installation](docs/system/installation.md) / [deployment](docs/deployment.md) for that configuration. Local setup never silently replaces a shared database URL. |
| Existing administrator password no longer matches the initial file     | Use the password you changed it to. Setup does not reset existing passwords or elevate an unrelated account.                                                                                                      |
| Port 3000/3001 already in use                                          | Stop the other app process before starting this one.                                                                                                                                                              |

## Development checks

```sh
pnpm --filter web build
pnpm check-types
pnpm test:browser-types
pnpm lint
pnpm test
pnpm check:secrets
pnpm build
pnpm check:production-build
pnpm check:server-build
```

Optional browser checks: `pnpm exec playwright install chromium`, then `pnpm test:browser`. These use synthetic fixtures on ports 3100/3101. See [test results](docs/test-report.md) for measured coverage and limits. Native setup has been exercised on Windows with MongoDB 9.0; macOS/Linux discovery is implemented but needs verification on those operating systems.

The web build always uses production mode without editing your local `.env`; development tools remain available through `pnpm dev`. Historical [pre-production audit](docs/audits/SECURITY_AUDIT.md), [verification results](docs/audits/TEST_RESULTS.md), [remaining risks](docs/audits/REMAINING_RISKS.md), and [release checklist](docs/DEPLOYMENT_CHECKLIST.md) distinguish completed local fixes from unresolved release blockers. MFA, password policy/reset, shared throttling and session hardening are implemented with local acceptance tests. Live verification delivery, production recovery/operations and other documented review gates remain pending; this application is not certified production-ready.

Optional real-database security checks: `pnpm test:security-db`. This creates a fresh random loopback test database and rolls back synthetic account records; it does not touch the working application database. Tests use local mocks and send no real verification messages. See the security operations guide for the exact scope and retained test artifacts.

Settings contains Account, Members, Roles and permissions, and Integrations. Older `/users`, `/roles`, and `/integrations` links redirect to Settings. Production hosting, private storage, backups, and provider credentials are covered separately in [deployment.md](docs/deployment.md); local usability does not certify production readiness.

## Google login and signup

Create a Google Cloud **Web application** OAuth client and configure the consent screen and test users. In your private apps/server/.env, set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. Keep APP_URL=http://localhost:3000 for the default local server. Register this exact authorized redirect URI:

`http://localhost:3000/api/auth/google/callback`

In production, new-account registration also requires ALLOW_PUBLIC_SIGNUP=true; existing accounts can still sign in when registration is disabled. Restart the server, then enable **Google sign-in** in Settings > Integrations. Both sign-in and signup use the same Google button. Without credentials or with the integration disabled, the button is unavailable; local password sign-in still works. For a shared deployment, set APP_URL to the public origin serving /api/auth/google and register that origin's HTTPS callback. See [Google's OAuth setup instructions](https://developers.google.com/identity/openid-connect/openid-connect#settingup).

Email signup requires separate first/last names, optional middle/suffix fields, phone number, Male/Female selection, and password; the Facebook profile URL is optional. Emails are trimmed and stored in lowercase. Existing emails are rejected, including concurrent signup attempts protected by MongoDB's unique email index. Google sign-in reuses an existing account with the verified email instead of creating a duplicate. New Google accounts receive the Alumni role (legacy internal key `viewer`) and must create a password after a fresh Google verification, without a current-password field. The Google proof expires after five minutes, is bound to the current session, and is consumed once; creating a password also revokes other sessions. Future password changes require the current password. No automatic/shared password is generated.

After pulling model/index changes, review `pnpm db:migrate --dry-run`. Back up local data before explicitly applying additive indexes with `pnpm setup:local --update-existing`; restart `pnpm dev` afterward.

## Required account verification

New form signups must confirm their email with a six-digit code and verify their phone before protected app access. Google already confirms email ownership; its new accounts must save contact details, create their required password, and verify their phone. These requirements are enforced on protected APIs and private file access, not just navigation. Existing password accounts and the seeded administrator remain usable; an existing Google-only account is routed through required setup on its next Google sign-in.

Email confirmation uses the existing HTTPS JSON mail gateway: configure SMTP_URL and SMTP_FROM in the private server environment and enable Email in Settings > Integrations. The gateway receives a POST body with from, to, subject, and text and must actually deliver the message. Direct smtp:// connections are not supported. SESSION_SECRET must contain at least 32 characters; local setup generates it. Codes are never returned by production APIs or written to logs: only a keyed hash is stored. Codes expire in 10 minutes, permit five attempts, and can be consumed once. Resends wait 60 seconds; changing contact information invalidates the previous verification.

**SMS delivery is unimplemented.** Local contact exemptions let functionality tests proceed without pretending contacts are verified or sending codes. Strict verification remains blocked until the SMS adapter and enabled email gateway are configured and accepted. Production refuses local exemptions; `/health/ready` returns 503 when mandatory verification providers are unavailable. The isolated test SMS adapter is never installed in the application.

Google sign-in does not silently activate a pending, unconfirmed password registration with the same email. Confirm the original registration email and sign in with that password before linking Google; this prevents a pre-registered password or phone from becoming trusted through someone else's Google verification.

## Account and tracking workflows

Architecture and REST contracts are documented in [the developer guide](docs/system/developer-guide.md). The [defense guide](docs/DEFENSE_GUIDE.md) traces one complete request and explains validation, ownership, MFA and errors. Follow the [migration and rollback runbook](docs/migrations/MONGOOSE_REST.md) before applying indexes to an existing database.

Current measured checks and remaining operational limits are recorded in [migration verification](docs/MIGRATION_VERIFICATION.md).

`viewer` remains the internal legacy role key; the interface labels it **Alumni**. Public registration creates the account and linked Alumni profile atomically after collecting student number and a valid degree program. Alumni sign in to **My Profile** and access only their explicitly linked record. Historical broad grants do not give Alumni directory or management access.

Graduation year is required for registration, academic saves and imports (1950–2100). Existing records with unknown years remain readable until corrected. Form dropdowns use the shared themed controls; suffix suggestions still allow custom text.

**Settings > Account** is the single place for personal details: structured name, profile photo, email, country-selectable phone, gender and Facebook contact. Photo controls sit inside Personal details for every role. The header and Alumni My Profile show the account photo. Photos use authenticated private delivery; replacing/removing one archives its metadata and does not delete historical evidence.

Phone numbers are cleaned on blur and validated on submission/API input using country numbering metadata. Redundant trunk zeros after international calling codes are removed where applicable; significant zeros, including Italian numbers, are preserved. Stored international numbers contain only `+` and digits.

Changing email requires the current password and a code delivered to the new address, even when local signup verification is relaxed. The old address remains active until confirmation succeeds. Confirmation verifies the new address, synchronizes the linked Alumni contact, invalidates password-reset links and signs out other sessions while preserving the current session's MFA proof. Live email changes need the enabled HTTPS mail gateway described above.

**My Profile** contains Alumni academic identity, employment and supporting evidence. Staff maintain student numbers, academic assignments and tracking decisions. Employment/file edits do not automatically mark a record tracked. Alumni evidence uploads notify Staff for review through the header bell between the theme control and account menu. Admin Alumni detail shows profile photo and supporting evidence separately.

**Members > Add user** offers Staff (default) and Super Admin only. Manual Alumni creation, account conversion to Alumni and manual linking are retired at the API boundary as well as in the UI. Alumni self-register; existing/imported historical records remain available for authorized review. Names and email matches never establish account ownership automatically.

**Departments** use names without codes. **Audit logs** show compact summaries with a clickable detail dialog containing the full recorded summary for that event. **Integrations** are restricted to administrators, including for Staff with historical grants; enabled status is green and disabled status is red. Settings also contains Roles and permissions.

Staff and Alumni do not require MFA, including accounts with saved enrollment. Administrator roles (`super_admin` or `admin`) require MFA, including mixed-role accounts, except during the explicit managed-local development pause described above. Passwords, sessions, account status, contact verification and permissions continue to apply. Signup email/phone verification and Google sign-in are separate from MFA; strict contact verification remains a deployment gate until real SMS and email delivery are accepted.

Additional isolated verification: `pnpm test:mongoose-db`, `pnpm test:forms-db`, `pnpm test:pentest-local` and `pnpm test:staging-local`. They create fresh synthetic loopback namespaces and retain them for inspection. Browser tests now use a fresh real MongoDB namespace on the managed local replica set; CI starts an ephemeral MongoDB replica set with a test-only dependency. No production database is touched by these checks.

## Isolated accounts for role demonstrations

Run `pnpm accounts:local` to provision fresh generated Admin, Staff and Alumni credentials in a guarded `collab_test_accounts_*` database. Read the generated JSON privately under `.tools/test-accounts/`; `latest.txt` identifies it. Then run `pnpm dev:accounts` and open **http://localhost:3003** (API port 3004). Port 3003 is available only while this command is running; it is a separate role demo, while the main app stays on port 3001. This starts the normal application with an isolated profile and preserves working database configuration. Administrator MFA is paused for this managed local role demo. Ctrl+C stops these test servers; MongoDB/data remain intact.

For automated role checks, install Chromium once with `pnpm exec playwright install chromium`. With those servers running, `pnpm test:roles-local` rehearses normal UI login for all three roles, the configured Admin MFA policy, Admin-only integrations, role/session revocation and disabled sessions. It saves synthetic screenshots and private authenticator/recovery artifacts under `.tools/role-browser/`. These files contain secrets: do not share or commit them. The tool only accepts the generated synthetic namespace; it has no production endpoint or fixed test password.

See [feature coverage](docs/FEATURE_MATRIX.md), [completion verification](docs/COMPLETION_VERIFICATION.md), [user guide](docs/system/user-guide.md), [defense guide](docs/DEFENSE_GUIDE.md) and [domain glossary](GLOSSARY.md). Public registration requires `ALLOW_PUBLIC_SIGNUP=true`; local role demonstrations set this explicitly without changing your private working configuration.
