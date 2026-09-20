# Implementation Guide

This document records how the Alumni Tracking System was implemented from [source-guide.md](./source-guide.md) and the gaps in [open-questions.md](./open-questions.md).

## System overview

Production-oriented monorepo on the existing Better-T-Stack:

- `apps/web` — React + TanStack Router staff UI
- `apps/server` — Hono + oRPC + cookie sessions
- `packages/db` — Prisma / MongoDB schema
- `packages/api` — routers, RBAC, validation, modular integrations
- `packages/ui` — shared UI primitives

Authorization is enforced on every protected oRPC procedure and on file/webhook HTTP routes. Hiding a button is never the only control.

## Architecture

```text
Browser (Vite SPA, proxied /rpc and /api)
  → HttpOnly session cookie
  → oRPC / REST file + webhook routes
  → RBAC permission check
  → Prisma / MongoDB
  → Modular adapters (reCAPTCHA, Google, email, imgBB, local files)
```

- **Auth:** email/password plus optional Google OAuth. First created user receives `super_admin` if no users exist. Seed creates `admin@alumni.local`.
- **RBAC:** Users → Roles → Permissions. Multiple roles per user. Keys live in `packages/db/src/permissions.ts`.
- **Academic hierarchy:** Department ← Program ← Alumni. Department ← Faculty (many-to-many).
- **Alumni profile:** student details, contact (mobile, personal email, Facebook), employment history, tracking events, evidence/images.
- **Dashboard:** live MongoDB counts. `% tracked = tracked / graduates × 100`.
- **Files:** Google Drive when configured, otherwise local `UPLOAD_DIR`. Images can also use imgBB.
- **Imports:** CSV, Google Sheets, and a signed Google Forms webhook, all through the same validated importer.

## Dashboard formula (conflict C-001)

The whiteboard example (`14750` graduates, `10000` tracked, `5%`) is internally inconsistent. The implemented formula is:

`percentTracked = round((tracked / graduates) * 100, 2)`

`IT` is treated as a **department code**. Seed data creates an Information Technology department.

## Modular integrations

| Key | Live behavior | Fallback when unconfigured |
|-----|---------------|----------------------------|
| reCAPTCHA | Verifies login/signup with Google reCAPTCHA | Local "I'm not a robot" checkbox |
| Google Auth | OAuth sign-in | Email/password only |
| Google Drive | Evidence upload | Local disk |
| Email | SMTP via nodemailer | Console log |
| Image host | imgBB or Drive | Local disk |
| Google Forms | Signed webhook import | Accepted without secret in development |
| Google Sheets | Import/export | CSV import/export |

Enable/disable flags are stored in `IntegrationSetting`.

## Installation

See [system/installation.md](./system/installation.md).

## Assumptions

1. RBAC is role-based (Roles + Users + Permissions), despite the guide wording “Rule Based”.
2. Named bootstrap roles were required because the guide names none.
3. A program belongs to exactly one department; an alumni record belongs to exactly one program.
4. A faculty may belong to multiple departments.
5. Contact fields are optional but validated when present.
6. Student details include student number, name, gender, graduation year, and batch.
7. Employment supports history plus a current status on the alumni record.
8. “Tracked” means the latest tracking event set `isTracked = true`.
9. Evidence belongs to an alumni record (and optionally a tracking event).
10. Image BB means imgBB; G. Auth / Drive / Forms / Sheets mean Google services.
11. Email can notify an alumnus at Personal Email and send a test message from Integrations.
12. Google Forms submissions are treated as tracked inbound updates.
13. The dashboard `5%` figure is illustrative, not a literal formula.

## Not implemented (unsupported by docs)

- AI Research Assistant
- Research project / title / document-completeness workflows
- Claims of legal document authenticity
