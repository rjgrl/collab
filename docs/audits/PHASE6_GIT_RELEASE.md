# Phase 6 Git release review

Hosted quality CI passed for published `ff07351` on Windows and Ubuntu: [run 39206075312](https://github.com/rjgrl/collab/actions/runs/39206075312), [sanitized jobs/steps and remote clone result](PHASE6_REMOTE_RESULTS.json). Follow-up documentation publication may create a new run; the cited pass applies specifically to its recorded SHA. There is no real-DB/recovery CI job or production deployment in this workflow.

Branch `development/phase6-cross-device-testing`; original HEAD `b04aab8dcd3926ae114a65eeacb120da98286432`. Checkpoint: [summary](PHASE6_SUMMARY.md). Consolidation includes interdependent previous hardening/UI/schema/testing/operations work and Phase 6 setup changes, without inventing an unreliable earlier authorship split.

Verified origin with public metadata and `git ls-remote --heads origin`: `https://github.com/rjgrl/collab.git`, public, default main at the original HEAD. Remote main has no checked-in workflows; quality CI is read-only and contains no deployment. Anonymous metadata cannot verify installed apps/webhooks, branch protection or write permissions. Confirm deployment consequences before publishing.

Excluded: actual .env files, .tools login/checkpoints/database/backup keys/archives, uploads, logs, generated clients/types, dependencies and builds. Source tests/evidence use synthetic identities and loopback URLs, not operational credentials. Pattern scanning is not a full history/provenance audit. Audit reports disclose security implementation and remaining blockers, so public approval must cover them too.

Local commits: `c53c22a` coherent hardening/reproducibility baseline (133 files); `3b13606` standalone pnpm launcher correction; `9c7bbac` complete setup-rerun preservation checks. The full SHA `9c7bbace4aef0f9aaea51ca53983ed7c0ea4b92e` passed the expanded committed-clone rehearsal. Subsequent evidence/onboarding-only documentation updates are recorded in Git history; no executable code changed after that accepted revision.

The owner explicitly answered “Approve publication; no deployment hook will run.” Normal non-force `git push --set-upstream origin development/phase6-cross-device-testing` succeeded at `ff07351fceebe2cb36e619a38ca0240229469c92`. Public content approval covers the hardening source, synthetic tests, sanitized reports and runbooks; deployment-hook absence is owner-attested rather than independently inspected. No main merge, release tag or deployment was performed.

Published branch: [development/phase6-cross-device-testing](https://github.com/rjgrl/collab/tree/development/phase6-cross-device-testing). A fresh HTTPS clone verified that exact SHA and passed independent setup/build/tests and actual app/MFA acceptance; see [clone results](PHASE6_FRESH_CLONE_RESULTS.md). Git write access is now demonstrated. Available CI results are recorded separately; anonymous installed-app/protection metadata remains unavailable.

Laptop command: `git clone --branch development/phase6-cross-device-testing --single-branch https://github.com/rjgrl/collab.git`, then follow the development setup guide. Later documentation-only evidence commits on this same approved branch record outcomes; they do not change the tested application code.
