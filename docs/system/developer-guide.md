# Developer guide

## Project structure

```
apps/web          React + TanStack Router UI
apps/server       Hono + oRPC API, cookie auth, file and webhook routes
packages/api      Routers, validation, RBAC, modular integrations
packages/db       Prisma schema, seed, permission catalog
packages/ui       Shared shadcn/ui primitives
```

## Architecture

```
Browser (Vite, port 3001)
  → proxy /rpc and /api to Hono (port 3000)
  → session cookie
  → permission check on each procedure / file route
  → Prisma / MongoDB
  → adapters (reCAPTCHA, Google, email, imgBB, local files)
```

Authorization is enforced on the server. Hiding a navigation link is not the only control.

## Database

Prisma models live in `packages/db/prisma/schema/schema.prisma`.

Core relationships:

```
User *—* Role *—* Permission
Department 1—* Program 1—* Alumni
Department *—* Faculty
Alumni 1—* Employment
Alumni 1—* TrackingEvent
Alumni 1—* EvidenceFile
```

IDs are MongoDB ObjectIds.

Soft deletes use `deletedAt`. MongoDB omits optional null fields unless they are written explicitly, so list/count queries match both `deletedAt: null` and unset `deletedAt`.

## APIs

oRPC procedures are mounted at `/rpc`. OpenAPI reference is at `/api-reference`.

Cookie/session HTTP routes:

- `POST /api/auth/login`
- `POST /api/auth/signup`
- `POST /api/auth/logout`
- `GET /api/auth/google`
- `GET /api/auth/google/callback`
- `POST /api/files/evidence`
- `GET /api/files/:id`
- `POST /api/integrations/google-forms/webhook`

## AI

No AI assistant is implemented. It is not specified in `docs/`.

## Configuration

Required: `NODE_ENV`, `CORS_ORIGIN`, `DATABASE_URL`.

Optional integration secrets are read from `process.env` so the app starts without them.

## Deployment

1. Set `NODE_ENV=production`, public `CORS_ORIGIN`, `APP_URL`, and `DATABASE_URL`
2. Run `pnpm run db:generate`, `pnpm run db:push`, `pnpm run db:seed`
3. `pnpm run build`
4. Serve `apps/web` as a static SPA behind HTTPS and run `apps/server`
5. Cookies are `Secure` in production

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Prisma P1013 | Connection string must include a database name |
| Cannot sign in | User must be `active` and have at least one role |
| Google button missing | Set both OAuth env vars and enable the integration |
| Upload fails | File type/size and `files.write` permission |
| Dashboard shows 0 | Seed academic structure and attach alumni to a program. List queries also match records where MongoDB omitted `deletedAt`. |
| `varlock codegen` crash on Windows | Codegen may still succeed; re-run `pnpm run env:generate` if `env.ts` is missing |
