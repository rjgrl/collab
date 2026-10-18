# Installation

1. Install **Node.js 22+** and **pnpm 12**.
2. Clone the repository and run `pnpm install`.
3. Copy environment files:
   - `apps/server/.env.example` → `apps/server/.env`
   - Set `DATABASE_URL` to a MongoDB connection string that includes a database name, for example `...mongodb.net/alumni_tracking?appName=Cluster0`
   - Set `CORS_ORIGIN=http://localhost:3001` and `APP_URL=http://localhost:3000`
   - `apps/web/.env` must include `VITE_SERVER_URL=http://localhost:3001`
4. Generate env accessors if needed: `pnpm run env:generate`
5. Generate the Prisma client: `pnpm run db:generate`
6. Push the schema: `pnpm run db:push`
7. Seed RBAC, the IT department, and a Super Admin: `pnpm run db:seed`
8. Start the apps: `pnpm run dev`

- Web: http://localhost:3001
- API: http://localhost:3000

Seeded login:

- Email: `admin@alumni.local`
- Password: `AlumniAdmin123!`

Change this password after first login on a shared database.

## Optional integrations

Add these to `apps/server/.env` only when you want live providers. Unset values use fallbacks.

- `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY` — otherwise a local checkbox is used
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — otherwise email/password only
- `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_DRIVE_FOLDER_ID` — otherwise local `UPLOAD_DIR`
- `SMTP_URL`, `SMTP_FROM` — otherwise email is logged
- `IMGBB_API_KEY` — otherwise local/Drive image storage
- `GOOGLE_SHEETS_SPREADSHEET_ID` — otherwise CSV import/export
- `GOOGLE_FORMS_WEBHOOK_SECRET` — `POST /api/integrations/google-forms/webhook`

Google OAuth redirect URI: `{APP_URL}/api/auth/google/callback`

## File storage

Local evidence files are stored in `UPLOAD_DIR` (default `./uploads`). Google Drive and imgBB are used when configured.
