# Alumni Tracking System

Modular staff application for RBAC, academic structure, alumni profiles, graduate tracking statistics, and optional Google / email / reCAPTCHA integrations.

Stack: React, TanStack Router, Hono, oRPC, Prisma, MongoDB.

## Getting started

```bash
pnpm install
pnpm run db:generate
pnpm run db:push
pnpm run db:seed
pnpm run dev
```

- Web: http://localhost:3001
- API: http://localhost:3000

Seeded Super Admin: `admin@alumni.local` / `AlumniAdmin123!`

`DATABASE_URL` must include a MongoDB database name, for example `...mongodb.net/alumni_tracking?...`.

See [docs/system/installation.md](docs/system/installation.md) and [docs/implementation.md](docs/implementation.md).

## Project structure

```
apps/web          React + TanStack Router UI
apps/server       Hono + oRPC API
packages/api      Routers, RBAC, integrations
packages/db       Prisma schema and seed
packages/ui       Shared shadcn/ui primitives
docs/             Requirements and system guides
```

## Scripts

- `pnpm run dev` — web (3001) and API (3000)
- `pnpm run db:push` / `db:generate` / `db:seed`
- `pnpm run test` — unit tests
- `pnpm run check` — format/lint and types
