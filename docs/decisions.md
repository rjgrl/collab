# Decisions

Append-only. Format: date, decision, why, alternatives rejected.

## 2026-11-09: Orchestrator plus Haiku workers

- Decision: the main session plans and verifies. `builder` and `reviewer` subagents on Haiku do bulk work.
- Why: cheaper bulk work, and the orchestrator keeps context for planning and checking.
- Guard: the orchestrator reruns every "Done when" check. Security-sensitive diffs get a line-by-line read.

## 2026-11-09: Share Claude config with the team

- Decision: commit `CLAUDE.md`, `.claude/agents/` and `.claude/skills/`. The rest of `.claude/` stays ignored.
- Why: every collaborator gets the same workflow, agents and skills.
- Rejected: unignoring all of `.claude/`, which would leak local settings and session state.

## 2026-11-09: "Refined institutional" UI direction

- Decision: keep the navy identity and modernize it: deep navy grouped sidebar, breadcrumb header, near-white canvas with white cards, stat tiles, split brand panel on auth pages. Tokens live in `packages/ui/src/styles/globals.css`.
- Why: biggest visual gain with proven AA contrast and a familiar layout for existing users.
- Rejected: a blue-and-gold rebrand (gold needs heavy contrast tuning) and a neutral SaaS look (least institutional).
- Constraints kept: 14px/1.5 body text and Inter (browser tests pin both), every accessible name the tests use, mobile "Open menu" dropdown (restyled with section labels, not a drawer).

## 2026-11-09: In-app confirm dialog replaces `window.confirm`

- Decision: destructive or discarding actions use `useConfirm()` (`apps/web/src/components/feedback/confirm-provider.tsx`) over the shared `ConfirmDialog`.
- Why: native prompts are unstyled, block the page and cannot carry a clear action label.
- Test impact: `tests/browser/completion.spec.ts` clicks the alertdialog's confirm button instead of pre-accepting a native dialog. No other test changed.

## 2026-11-09: Line endings and folder conventions

- Decision: `.gitattributes` forces LF. `apps/server/src` holds runtime code only; check scripts and the Playwright fixture live in `apps/server/test/`. Web helpers live in `apps/web/src/lib/`; components are grouped by feature. Test helpers and CLI entry points get their own folders (`packages/api/src/test-utils`, `packages/db/src/cli`).
- Why: Windows `core.autocrlf=true` made `pnpm check` flag every file; mixed runtime/test files made the server source hard to scan.
- Deferred: renaming the `@Alumni-Tracking-Ss` scope (about 490 references plus the lockfile) and moving server-coupled tests out of `packages/api` (the RBAC catalog test scans paths relative to its own location).
