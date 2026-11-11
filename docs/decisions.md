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

## 2026-11-09: Password policy adds character-type rules (deviates from NIST SP 800-63B)

- Decision: new passwords need 15–128 characters (code points after NFC), an uppercase letter, a lowercase letter, a number and a special character, plus the server-side common/breached check. The owner chose this option over length-only rules.
- Deviation: NIST SP 800-63B advises against composition rules. This is an intentional, owner-approved deviation.
- Details: the rules live once in `packages/contracts/src/password-policy.ts` (`PASSWORD_REQUIREMENTS`); `newPasswordSchema` and the live checklist both read that list. Character classes use Unicode properties, so non-ASCII letters count. A space counts as a special character (OWASP's special-character list includes it), so passphrases stay usable. Scripts without letter case (for example CJK-only passwords) cannot meet the case rules.
- Consequence: the bundled common-password list has no entry that meets the new rules, so the opt-in HIBP check (`PASSWORD_BREACH_CHECK=hibp`) is now the meaningful screen. The common check still runs first so its message wins for API clients.
- Rejected: keeping the length-only policy (option A).

## 2026-11-09: Compact single-page sign-up

- Decision: sign-up stays one page. Google sign-up and an "or" divider come first, then Personal / Contact / Academic / Account fieldsets in a 3–4 column grid on desktop, single column on mobile.
- Why: at 1440×900 the Create account button ends at about 871px with no scrolling; at 1366×768 it needs one short scroll. Inputs and buttons keep their existing 40px height and 14px text, so the two-step fallback was not needed.
- Test: `tests/browser/signup.spec.ts` asserts the button is fully in view at 1440×900, within 320px of the fold at 1366×768, and that fields stack on a 390px phone.
- Note: the existing 40px controls are below a 44px touch target; this layout does not make them smaller.

## 2026-11-09: Roles keep permissions; no per-user permissions

- Decision: permissions stay on roles. Super Admins change a member's role from the Members page ("Edit role"); the dialog's permission checklist only finds the role whose permission set matches exactly (`matchingRoles` in `packages/contracts/src/role-match.ts`, order-independent, ignores retired or unknown permissions). With no exact match, saving is blocked and the dialog offers to create a new role with those permissions, then assigns it.
- Why: per-user grants would bypass role review and the scope rules that already protect Super Admin assignments and Alumni/managed transitions.
- Guards unchanged: `usersService.update` still decides every transition (users.write, `assertRoleScope`, Super Admin protection, no conversion to Alumni, staff email domains) and still revokes the member's sessions. The UI only hides the action from non-administrators; the server returns 403 to them.
- Rejected: per-user permission overrides.

## 2026-11-09: Role "Description" is shown as "Note"

- Decision: the UI calls the role description a "Note". It shows under the role name on role cards (two lines, full text on hover/focus), in the Edit role picker, and is editable with the role name in the role detail view. Creating or renaming a role to an existing name shows a non-blocking warning asking for a Note that tells them apart.
- Kept: the stored and API field is still `description` (no migration, no contract rename). Audit summaries label it "Note" for roles only.
- Known side effect: any role update, including a note-only edit, revokes the sessions of that role's members (existing server behavior, kept unchanged).
