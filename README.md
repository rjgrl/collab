# Alumni Tracking System

A local testing setup for the team: React/TanStack Router, Hono/oRPC, Prisma, and MongoDB. Every laptop/desktop runs its own database. No Atlas account, shared database password, Docker, or Google credentials are required for the core application.

## Install once on each device

| Requirement     | What to install                                                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git             | [Git installer](https://git-scm.com/downloads)                                                                                                                                                              |
| Node.js         | Node **26.10.0** is the tested version, recorded in `.node-version`. The project requires Node 22.15+; use the tested version for consistent team results. [Node downloads](https://nodejs.org/en/download) |
| pnpm            | Install **12.5.1** after Node: `npm install --global pnpm@12.5.1`                                                                                                                                           |
| MongoDB Server  | [MongoDB Community Server](https://www.mongodb.com/docs/manual/administration/install-community/), including `mongod`. **MongoDB 9.0 is tested.** Use an installer supported by your OS/CPU.                |
| MongoDB Compass | [Compass](https://www.mongodb.com/try/download/compass), for viewing/editing the local test database                                                                                                        |

**Compass is the database GUI; it does not replace MongoDB Server.** Install both. The app connects to the same server that you open in Compass. Prisma requires a replica set for transactions, even when there is only one local server. The committed scripts initialize that replica set automatically.

On Windows, MongoDB's standard installation directory is detected automatically, even if `mongod` is not on PATH. You may leave the installer's Windows service option unchanged: this project uses a separate background process on port **27018**, avoiding the usual service on 27017. On macOS/Linux, install the Community Server using MongoDB's OS-specific instructions and make `mongod` available on PATH (`mongod --version` should work).

Restart your terminal after installing Node/pnpm or changing PATH. Initial dependency installation needs internet access. Native MongoDB binaries are installed per device and are not committed to Git.

## First run after cloning

```sh
git clone https://github.com/rjgrl/collab.git
cd collab
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev
```

Open **http://localhost:3001**. The API runs on **http://localhost:3000**. Keep the terminal running while testing; Ctrl+C stops the application.

`pnpm setup:local` performs these steps in order:

1. Creates missing `apps/server/.env`, `apps/web/.env`, and `packages/db/.env` values for local testing. Existing nonempty values are preserved.
2. Generates a unique initial administrator password on that device and saves the login privately in **`.tools/local-login.txt`**. Open that file to get your email/password; do not commit or share it.
3. Generates environment types and the platform-specific Prisma client.
4. Starts MongoDB on loopback port 27018, initializes replica set **rs0**, and waits until it has a writable primary.
5. Applies the Prisma collections/indexes without reset/data-loss flags, then seeds permissions, roles, and the local administrator.
6. Checks the administrator account and performs a real MongoDB transaction/rollback probe, so replication failures are caught before you start the app.

For sample departments and three synthetic alumni, use **`pnpm setup:local --demo`** instead of `pnpm setup:local`. This is optional; normal setup gives you an administrator and an empty application ready for data entry. Development sign-in may show an "I am not a robot" checkbox; tick it before submitting. Real reCAPTCHA/Google/provider keys are optional and should never be copied between machines through Git.

There is no shared, hardcoded administrator password. Changing a password in Account settings does not cause setup to reset it. If you rerun setup after changing it, use the current password; the initial-login file may contain the original password.

## Run again, or update after a pull

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

Setup is safe to rerun: it preserves local configuration, existing account passwords, and database records. Schema changes still need review before applying them to valuable data. If Prisma reports an index conflict or a potentially destructive change, setup stops; do not add `--accept-data-loss` or delete your data to bypass it. The system uses MongoDB, so **do not run Prisma Migrate**.

## Connect using MongoDB Compass

1. Run `pnpm setup:local` or `pnpm dev` so the server is running.
2. Open Compass, choose **Add new connection**, and paste:

   ```text
   mongodb://127.0.0.1:27018/?replicaSet=rs0
   ```

3. Connect and open **`alumni_tracking`**. You should see collections such as `User`, `Role`, `Permission`, `Alumni`, and `Department` after setup.

The application's generated local server environment uses:

```dotenv
DATABASE_URL=mongodb://127.0.0.1:27018/alumni_tracking?replicaSet=rs0
```

Closing Compass does not stop MongoDB. Closing the application terminal leaves the local database process running for Compass and future app starts. Database files persist in **`.tools/mongodb-rs0/data`**; logs are in **`.tools/mongodb-rs0/mongod.log`**. Do not delete that directory unless you deliberately intend to discard that local database. This loopback-only, single-node, unauthenticated setup is for local testing, not public hosting or real confidential alumni records.

## What teammates get from Git

Committed: all source packages, workspace manifests, pinned pnpm lockfile, Prisma schema, seed logic, environment schemas/examples, native MongoDB discovery/startup and replica initialization scripts, setup/verification scripts, and documentation. Prisma clients/types are generated on each machine to match its platform.

Ignored deliberately: real `.env` files, per-device passwords, MongoDB data/logs, uploads, `node_modules`, generated Prisma clients/types, build outputs, and test traces. `pnpm install` and `pnpm setup:local` recreate the required local dependencies/config/generated files. Team changes to database records are **not** synchronized by Git; commit synthetic seed changes if everyone needs the same sample data.

Do not copy another person's `node_modules`, generated Prisma engine, `.tools`, or `.env` files into your clone. Do not overwrite your local environment with examples on every pull.

## Troubleshooting

| Symptom                                                                | Action                                                                                                                                                                                                            |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm` or `node` not recognized                                        | Install the versions above, restart the terminal, and check `node --version` / `pnpm --version`.                                                                                                                  |
| `Install MongoDB Server` / `mongod` missing                            | Compass alone is insufficient. Install Community Server; on macOS/Linux put `mongod` on PATH. On Windows keep the standard installation directory.                                                                |
| Connection refused at 27018                                            | Run `pnpm db:local`; inspect `.tools/mongodb-rs0/mongod.log` if it exits. Normal `pnpm dev` also runs this check.                                                                                                 |
| `ReplicaSetNoPrimary` or transaction/replica-set errors                | Run `pnpm db:local` and wait for `rs0 is PRIMARY`. Check that your private URL includes `?replicaSet=rs0` and port 27018, rather than a standalone server on 27017.                                               |
| Another server owns port 27018 / a different replica set               | The helper refuses to reconfigure unmanaged data. Inspect that process/config before changing it; do not force `rs.reconfig()` or delete directories.                                                             |
| Missing Prisma client / route types                                    | Run `pnpm setup:local`. For standalone typechecks on a fresh clone, first run `pnpm --filter web build` to generate route types.                                                                                  |
| MongoDB upgraded/moved after a previous setup                          | The saved binary path is intentionally pinned for existing data. Restore the binary or plan a proper MongoDB upgrade; the helper does not automatically upgrade existing database files.                          |
| Setup refuses a custom/remote `DATABASE_URL` or production environment | Your existing values were preserved. Use [manual installation](docs/system/installation.md) / [deployment](docs/deployment.md) for that configuration. Local setup never silently replaces a shared database URL. |
| Existing administrator password no longer matches the initial file     | Use the password you changed it to. Setup does not reset existing passwords or elevate an unrelated account.                                                                                                      |
| Port 3000/3001 already in use                                          | Stop the other app process before starting this one.                                                                                                                                                              |

## Development checks

```sh
pnpm --filter web build
pnpm check-types
pnpm lint
pnpm test
pnpm check:secrets
pnpm build
```

Optional browser checks: `pnpm exec playwright install chromium`, then `pnpm test:browser`. These use synthetic fixtures on ports 3100/3101. See [test results](docs/test-report.md) for measured coverage and limits. Native setup has been exercised on Windows with MongoDB 9.0; macOS/Linux discovery is implemented but needs verification on those operating systems.

Settings contains Account, Members, Roles and permissions, and Integrations. Older `/users`, `/roles`, and `/integrations` links redirect to Settings. Production hosting, private storage, backups, and provider credentials are covered separately in [deployment.md](docs/deployment.md); local usability does not certify production readiness.
