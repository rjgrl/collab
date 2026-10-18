# Alumni Tracking System

React/TanStack Router, Hono/oRPC, Prisma/MongoDB, and shared Tailwind/Base UI components in a pnpm monorepo.

## Local setup

1. Install Node 22+ and pnpm 12.5.1. Recorded verification used Node 26.10.0.
2. Configure private server/web environment files from the committed examples. `DATABASE_URL` must name a MongoDB database on a replica set. Local web and API URLs are `http://localhost:3001` and `http://localhost:3000`.
3. Supply `SEED_ADMIN_EMAIL` and a unique `SEED_ADMIN_PASSWORD` of at least 12 characters through the seed environment or protected `packages/db/.env`. There is no built-in login password. Public signup creates a Viewer in development; production requires explicit `ALLOW_PUBLIC_SIGNUP=true` or administrator-provisioned accounts.

```sh
pnpm install --frozen-lockfile
pnpm env:generate
pnpm db:generate
# For a new approved database; review and back up existing databases first:
pnpm db:push
pnpm db:seed
pnpm dev
```

The seed preserves editable role permissions and repairs missing protected administrator permissions. Existing account passwords are not overwritten. Demo academic/alumni records require `SEED_DEMO_DATA=true` in development; production rejects that setting. Prisma Migrate is not supported for MongoDB.

## Settings and access

Settings contains Account, Members, Roles and permissions, and Integrations. Role groups have accessible master/individual controls, mixed states, unsaved drafts, explicit saves, and conflict handling. Server permissions independently protect operations. The Super Admin role and its assignments are protected from removal or disablement through the application.

Old `/users`, `/roles`, and `/integrations` URLs redirect to Settings. `roles.update` requires `expectedUpdatedAt`; account status changes use `users.setStatus` with `users.delete`. User responses exclude password hashes.

## Checks

```sh
pnpm --filter web build # generates route types on a fresh checkout
pnpm check-types
pnpm lint
pnpm test
pnpm check:secrets
pnpm audit
pnpm exec playwright install chromium
pnpm test:browser
pnpm build
```

Browser tests use synthetic data, actual Hono/oRPC transport, and ports 3100/3101; they never use the configured database. Real MongoDB durability and external providers require separate staging checks. `pnpm check` also checks repository-wide formatting; pre-existing formatting debt is recorded in the test report.

See [deployment](docs/deployment.md), [changes](docs/change-report.md), [test results](docs/test-report.md), and the [initial audit](docs/audit.md). This release has not been deployed or certified production-ready.
