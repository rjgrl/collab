# Cross-device readiness

| Gate            | State / limit                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Toolchain       | Node 26.10.0 / pnpm 12.5.1 pinned; minimum Node 22.15. Corepack availability documented.                                                  |
| Database        | Native MongoDB Server required; prior Windows 9.0.2 acceptance. Compass is a GUI. Writable rs0 and rollback checks retained.              |
| Isolation       | New checkout gets random persistent database; existing URLs/keys/passwords preserved. Populated database changes require explicit update. |
| Prisma          | Generated per machine after install. Windows DLL lock requires stopping this checkout's servers, without copying another engine.          |
| Doctor          | Explicit `pnpm run doctor`, read-only, redacted; selected readiness only.                                                                 |
| Committed clone | Rehearsal harness implemented; execution recorded in clone results.                                                                       |
| Other devices   | Physical laptop/Linux/macOS/remote CI pending. Quality matrix proposed only.                                                              |
| Providers       | Disabled/disconnected until configured. Seeded admin works locally; new signup verification remains restricted.                           |

See [setup](../DEVELOPMENT_SETUP.md), [Windows](../WINDOWS_SETUP.md), [troubleshooting](../TROUBLESHOOTING.md). Independent loopback instances are the supported multi-device mode; LAN sharing requires separate network/TLS/origin review. No copied secrets or shared unauthenticated MongoDB exposure.
