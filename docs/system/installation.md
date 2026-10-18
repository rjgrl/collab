# Installation

## Team testing setup

The [README](../../README.md) is the primary clone/pull guide. Install Git, the tested Node version, pnpm 12.5.1, MongoDB Community Server (`mongod`), and Compass. Then run:

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev
```

Local setup creates missing private environment values and a per-device administrator login in `.tools/local-login.txt`, generates Prisma, starts and initializes `rs0`, waits for a primary, provisions collections/indexes, seeds access control, and verifies real transaction rollback. Optional synthetic samples can be requested with `pnpm setup:local --demo`.

Subsequent `pnpm dev`, `pnpm db:push`, and `pnpm db:seed` commands check/start the managed local replica set automatically. Existing environment values, passwords, and records are preserved. After a pull, repeat install and setup before starting the app.

Use Compass with `mongodb://127.0.0.1:27018/?replicaSet=rs0` and select `alumni_tracking`. Compass is a GUI and requires MongoDB Server to be running. No manual replica-set initialization, Docker, or Atlas subscription is required for this native local setup.

Data and logs persist in `.tools/mongodb-rs0/` and are ignored by Git. MongoDB runs in the background on loopback port 27018, separately from the installed Windows service. Closing Compass does not stop it. Rerun `pnpm dev` or `pnpm db:local` after reboot. Do not delete the directory to fix a connection error; inspect `mongod.log` first. Existing local data stays pinned to the binary that created it, so upgrades require an explicit plan.

## Custom or production configuration

Local setup refuses production mode and database URLs outside its managed localhost:27018 rs0 configuration, leaving those values unchanged. Use [deployment.md](../deployment.md) for custom databases and production hosting.

For manual setup, configure server/web environment values privately, install dependencies, run `pnpm env:generate` and `pnpm db:generate`, then provision reviewed schema/index changes using `pnpm db:push`. Supply private `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` before `pnpm db:seed`. Environment variables supplied by a secret manager are supported; a committed or copied real `.env` file is never required.

There is no built-in administrator password. Public production registration is disabled unless explicitly enabled by policy. Bootstrap never resets existing passwords or automatically elevates an unrelated existing account. Sample data is opt-in and prohibited in production.

Production requires HTTPS, private storage, a MongoDB replica set, and staging/backup verification. Prisma Migrate is unsupported for MongoDB; do not run migration/reset commands to bypass a replica-set error.
