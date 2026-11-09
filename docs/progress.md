# Progress

Newest first. One entry per session: date, what changed, what was verified, what remains.

## 2026-11-09 (UI overhaul and structure cleanup)

- Structure: `.gitattributes` forces LF (fixed `pnpm check` on Windows); removed dead files and stale Prisma ignores; moved server check scripts and the browser fixture to `apps/server/test/`; folded `modules/programs` into `modules/academic`; dropped api re-export shims; moved the api model fixture to `src/test-utils` and db CLI scripts to `src/cli`; merged web `utils/` into `lib/` and grouped components by feature (`page-header.tsx` split into `layout/page.tsx`, `forms/form-layout.tsx`, `data/filter-bar.tsx`).
- UI: new navy/near-white token set and component polish; grouped navy sidebar with breadcrumb header; split brand panel on login, reset, security and complete-profile; `StatTile`, `ErrorAlert` and `ConfirmDialog` used across pages; every `window.confirm` replaced.
- Verified: `pnpm check` green (1 pre-existing lint warning), `pnpm test` 280/280, `pnpm test:browser` 74/74 (desktop + mobile, axe WCAG 2.2 AA light/dark). Baseline before the work was also 74/74 once Playwright Chromium was installed.
- Next: decide whether to rename the package scope and relocate server-coupled tests in `packages/api` (both deferred).

## 2026-11-09

- Set up orchestrator/worker workflow: CLAUDE.md, builder and reviewer agents, reflect skill, these docs.
- Unignored `CLAUDE.md`, `.claude/agents/` and `.claude/skills/` so the team shares them.
- Verified: `git check-ignore` confirms the new files are tracked and `.claude/settings.local.json` stays ignored.
- Branch: development/phase6-cross-device-testing at f6a9be3.
- Next: pick the next phase 6 task.
