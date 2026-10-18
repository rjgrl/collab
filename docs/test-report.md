# Test report

Recorded on 2026-10-18 using Windows, Node 26.10.0, pnpm 12.5.1, and Prisma 6.19.3. No live database data was read or changed. Browser fixtures use synthetic accounts and an in-memory adapter with actual Hono/oRPC transport.

## Baseline

- Initial dependency installation failed on a duplicate `overrides` key in `pnpm-workspace.yaml`; corrected the YAML and misplaced `utf-8-validate` build approval before continuing.
- After configuration repair, `pnpm install --frozen-lockfile` passed and `pnpm db:generate` generated the client.
- Existing tests: 36 passed, 1 failed. The failure identified `users.delete` and `reports.read` as unenforced catalog permissions.
- Initial typecheck failed on missing generated routes, optional faculty/program edit IDs, and Node types pulled through API source. A web build generates routes; the source type errors were fixed.
- Initial production build passed. Lint passed with two existing redundant-spread warnings in `packages/api/src/routers/academic.ts`.
- Repository-wide formatting had broad existing failures. The first full formatting check during this work reported 182 files, including untouched files; it was not a clean baseline.
- The first production dependency audit found four high advisories. A broader audit also identified seroval and tinypool development advisories. Remediations are recorded in the change report.

## Final gates

| Command / procedure                                         | Result                    | Evidence and limits                                                                                                                                   |
| ----------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                            | Pass                      | Final manifests/lockfile install without resolution changes                                                                                           |
| `pnpm db:generate`                                          | Pass                      | Prisma 6.19.3 client generated locally, no database writes                                                                                            |
| `pnpm --filter @Alumni-Tracking-Ss/db exec prisma validate` | Pass                      | Schema valid; validates from the package directory with its config                                                                                    |
| `pnpm check-types`                                          | Pass                      | All five workspace typecheck targets                                                                                                                  |
| `pnpm lint`                                                 | Pass with warnings        | Same two pre-existing redundant-spread warnings; no new lint errors                                                                                   |
| `pnpm test`                                                 | Pass                      | 57 tests, 14 suites, zero failures                                                                                                                    |
| `pnpm test:browser`                                         | Pass                      | Six tests: desktop Chromium and mobile Chromium emulation                                                                                             |
| axe WCAG 2/2.1/2.2 A/AA checks                              | Pass in tested pages      | No violations reported on selected-role and Integrations pages at both viewports; not whole-application WCAG certification                            |
| Keyboard and responsive checks                              | Pass in tested workflows  | Space toggles group controls; no horizontal document overflow at desktop/mobile widths                                                                |
| `pnpm build`                                                | Pass                      | Web assets and server bundle built; native Prisma engine copied to server dist                                                                        |
| `node scripts/smoke-built-server.mjs`                       | Pass                      | Built production process: live 200, deliberately unavailable local synthetic DB readiness 503, anonymous file request 401                             |
| `pnpm audit`                                                | Pass                      | Zero info/low/moderate/high/critical advisories in the final full dependency tree                                                                     |
| `pnpm check:secrets`                                        | Pass                      | Conservative pattern scan of tracked/eligible files; no high-confidence secrets found. Does not prove absence of all secrets or scan history contents |
| `vp fmt --check <changed files>`                            | Pass                      | Changed supported files formatted; generated lockfile and unmodified licensed upstream stylesheet retain their own format                             |
| `git diff --check`                                          | Pass                      | No whitespace errors                                                                                                                                  |
| Whole-repository `vp fmt --check` / `pnpm check`            | Remaining formatting debt | Untouched files still require a separate formatting cleanup; checks were not disabled or suppressed                                                   |
| Real MongoDB integration, transactions, restart durability  | Not run                   | No isolated replica set, MongoDB binary, or Docker available. Synthetic adapter tests do not establish database rollback or persistence guarantees    |
| Live OAuth, reCAPTCHA, Drive, Sheets, mail gateway          | Not run                   | Requires configured staging providers and owner-supplied credentials                                                                                  |
| Deployment, proxy/TLS, backups and restore                  | Not run                   | No deployment environment selected or provisioned                                                                                                     |

## Coverage

Unit/HTTP tests cover permission groups (on/off/mixed), independent toggles, permission catalogs, authorization gates, safe user projections, delegated-role restrictions, protected administrator invariants, expected-version save claims, persistence failures, CSV formula neutralization, MIME spoofing, file containment, remote image URL restrictions, disabled-session file rejection, request size limits, OAuth state rejection, CSRF origin checks, auth rate limiting, and existing domain helpers.

Browser tests exercise actual login, Settings navigation, group and individual permission changes, dirty state, successful save/reload, failed-save draft preservation, concurrent/stale update errors, integration enable/disable persistence, keyboard toggling, automated accessibility, and viewport overflow. Persistence is within a synthetic adapter, including across browser reloads, not a real MongoDB server restart.

Screenshots are generated under ignored `test-results/` folders. Desktop Roles and mobile Integrations screenshots were visually inspected; spacing, wrapping, controls, and navigation were checked. The final rerun updates these artifacts. Chromium mobile emulation is not an iOS Safari compatibility test.

The development browser emits an existing React warning about a script produced by the route head; it did not prevent the tested workflows. Vite+ peer-version warnings remain because the Vite replacement reports version 0.3.1, while plugins declare Vite semver ranges. Builds and browser checks pass with this installed combination. No claim is made about untested dependency combinations.

## Required staging verification

Create an isolated MongoDB replica set with synthetic records. Test successful role/user assignment transactions, forced write/audit failures with rollback, simultaneous saves from separate clients, disabled/password-changed session revocation, safe bootstrap/reseed behavior, and persistence after an API/database restart. Then verify permitted and denied evidence access against local and private Drive storage, live provider callbacks, backups/restores, and the actual HTTPS proxy configuration. Do not run these checks on real alumni records.
