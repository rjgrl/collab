# Phase 6 Git release review

Branch `development/phase6-cross-device-testing`; original HEAD `b04aab8dcd3926ae114a65eeacb120da98286432`. Checkpoint: [summary](PHASE6_SUMMARY.md). Consolidation includes interdependent previous hardening/UI/schema/testing/operations work and Phase 6 setup changes, without inventing an unreliable earlier authorship split.

Verified origin with public metadata and `git ls-remote --heads origin`: `https://github.com/rjgrl/collab.git`, public, default main at the original HEAD. Remote main has no checked-in workflows; proposed quality CI is read-only and contains no deployment. Anonymous metadata cannot verify installed apps/webhooks, branch protection or write permissions. Confirm deployment consequences before publishing.

Excluded: actual .env files, .tools login/checkpoints/database/backup keys/archives, uploads, logs, generated clients/types, dependencies and builds. Source tests/evidence use synthetic identities and loopback URLs, not operational credentials. Pattern scanning is not a full history/provenance audit. Audit reports disclose security implementation and remaining blockers, so public approval must cover them too.

Local commits: `c53c22a` coherent hardening/reproducibility baseline (133 files); `3b13606` standalone pnpm launcher correction; `9c7bbac` complete setup-rerun preservation checks. The full SHA `9c7bbace4aef0f9aaea51ca53983ed7c0ea4b92e` passed the expanded committed-clone rehearsal. Subsequent evidence/onboarding-only documentation updates are recorded in Git history; no executable code changed after that accepted revision.

No push occurred. After explicit public-content approval and confirmation that no deployment hook fires, use normal non-force `git push --set-upstream origin development/phase6-cross-device-testing`. Do not bypass the hold, merge main or tag a release. Remote clone/CI remain pending until publication. After publication, laptop clone commands are `git clone --branch development/phase6-cross-device-testing --single-branch https://github.com/rjgrl/collab.git`, then follow the development setup guide. These commands cannot currently retrieve an unpublished branch.
