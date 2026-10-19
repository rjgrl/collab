# Phase 6 cross-device engineering

2026-10-19. Local only; production remains blocked. Preserved the inherited tree at ignored `.tools/phase6-checkpoint-20261019-132508/`: tracked patch, HEAD/status and 300 hash-verified eligible source copies. Continued on `development/phase6-cross-device-testing` from `b04aab8dcd3926ae114a65eeacb120da98286432`. No private configuration, existing application records or providers modified.

Implemented random persistent databases per new checkout, explicit existing-database schema/seed updates, read-only `pnpm run doctor`, toolchain guards, production seed refusal, synthetic demo identities, onboarding/Windows/troubleshooting guides and proposed Windows/Linux CI matrix. No Phase 6 dependency upgrade or schema change. Previous security controls preserved.

Baseline 139 Node tests passed. Current local gates pass: 141 Node tests, 34 browser tests, HTTP security acceptance, Forms/permission acceptance, real MongoDB security acceptance, types/browser types, warning-as-failure lint, secret-pattern scan, production build and web/server artifact checks. New rehearsal code initially failed type checking on optional configuration; explicit assertions corrected it before consolidation.

`pnpm doctor` invokes pnpm's own diagnostic, including registry checks. Application diagnostics must use `pnpm run doctor`. The new application doctor safely rejected a selected readiness invariant in the original development database and made no repairs; fresh-clone acceptance is separate. No application database schema was pushed.

Inherited changes are tightly coupled; a coherent local baseline avoids invented attribution or broken partial commits. Commit/clone evidence: [Git release](PHASE6_GIT_RELEASE.md), [clone results](PHASE6_FRESH_CLONE_RESULTS.md), [cross-device limits](PHASE6_CROSS_DEVICE_READINESS.md). Remote `rjgrl/collab` is public: explicit publication approval and deployment-hook confirmation are required before push. No push, main merge, tag or deployment occurred.
