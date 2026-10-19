# Cross-device readiness

Hosted Windows/Ubuntu quality CI PASS at `ff07351`: [run](https://github.com/rjgrl/collab/actions/runs/39206075312). This proves hosted install/generation/build/type/unit/browser gates, not native MongoDB startup/recovery on another OS or a physical laptop. Remote-clone acceptance also passed on the original Windows host.

Publication update: owner-approved public branch push succeeded, and an actual GitHub clone at `ff07351` passed setup/build/types, 141 Node tests and real app/MFA plus complete setup-rerun preservation. See [remote evidence](PHASE6_FRESH_CLONE_RESULTS.md). Hosted Windows/Linux CI is tracked separately; it does not test native MongoDB startup or recovery on those runners. Physical second-device acceptance remains pending.

Physical laptop acceptance is pending. Record OS/CPU, browser/version, commit and viewport. Chromium desktop/mobile fixture automation is the measured boundary; Firefox, Safari/iOS and actual Android devices remain unverified.

Second-device checklist:

- [ ] Follow only committed documentation; verify frozen install, setup, doctor and build.
- [ ] Use that device's private bootstrap login, enroll MFA, save recovery codes and test logout/reauthentication.
- [ ] Navigate dashboard/alumni/departments/programs/settings/reports and selected denied APIs using synthetic roles.
- [ ] Test create/edit dialogs, validation, filters/pagination, evidence and authorized export with synthetic records.
- [ ] Check narrow navigation/dialog scrolling, keyboard focus, labels/errors, touch targets, zoom, forced colors and an actual screen reader.
- [ ] Confirm session persistence/logout; stop only owned processes. Do not remove database files to troubleshoot.

LAN/mobile access to another machine is not configured. Prefer independent laptop testing until private HTTPS, firewall allowlist, coherent origins/cookies and non-debug exposure are authorized. No router forwarding, browser-security bypass or MongoDB network exposure.

| Gate            | State / limit                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Toolchain       | Node 26.10.0 / pnpm 12.5.1 pinned; minimum Node 22.15. Corepack availability documented.                                                  |
| Database        | Native MongoDB Server required; prior Windows 9.0.2 acceptance. Compass is a GUI. Writable rs0 and rollback checks retained.              |
| Isolation       | New checkout gets random persistent database; existing URLs/keys/passwords preserved. Populated database changes require explicit update. |
| Prisma          | Generated per machine after install. Windows DLL lock requires stopping this checkout's servers, without copying another engine.          |
| Doctor          | Explicit `pnpm run doctor`, read-only, redacted; selected readiness only.                                                                 |
| Committed clone | Rehearsal harness implemented; execution recorded in clone results.                                                                       |
| Other devices   | Hosted Windows/Ubuntu quality CI passed; physical laptop/macOS and native Linux MongoDB setup remain pending.                             |
| Providers       | Disabled/disconnected until configured. Seeded admin works locally; new signup verification remains restricted.                           |

See [setup](../DEVELOPMENT_SETUP.md), [Windows](../WINDOWS_SETUP.md), [troubleshooting](../TROUBLESHOOTING.md). Independent loopback instances are the supported multi-device mode; LAN sharing requires separate network/TLS/origin review. No copied secrets or shared unauthenticated MongoDB exposure.
