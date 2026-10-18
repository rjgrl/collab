# Installation

Follow the current [deployment and setup guide](../deployment.md) for the complete environment inventory, private bootstrap credentials, MongoDB replica-set requirement, commands, storage, and release checks.

For local development, configure `apps/server/.env` and `apps/web/.env` from their examples, install pnpm 12.5.1, run `pnpm install --frozen-lockfile`, `pnpm env:generate`, and `pnpm db:generate`. Run `pnpm db:push` only against a new approved database or after reviewing/backing up an existing one. Supply private `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` values before `pnpm db:seed`, then run `pnpm dev`.

There is no default administrator password. Public registration always creates a Viewer. Previously seeded demo credentials must be rotated manually on existing databases. Demo sample data is development-only and opt-in.

Web runs on port 3001; API runs on port 3000. Set `VITE_SERVER_URL=http://localhost:3001` so the local proxy handles RPC, authentication, and private files consistently.

Production must use HTTPS, persistent private storage, a replica set, and the staging verification steps in the linked guide. Prisma Migrate is unsupported for MongoDB; use reviewed schema/index provisioning with Prisma db push.
