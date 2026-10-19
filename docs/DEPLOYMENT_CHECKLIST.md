# Controlled release review checklist

- [ ] Remove `LOCAL_DISABLE_MFA=true` from deployment configuration. Production rejects it; verify administrator enrollment, login and recovery with MFA enforced before release. Local testing may temporarily pause enforcement without deleting enrollment.

Phase 6: [local consolidation and cross-device work](audits/PHASE6_SUMMARY.md). Public publication requires explicit approval; no deployment authorized.

- [x] Preserve inherited work; add isolated checkout setup, explicit existing-database updates and read-only diagnostics.
- [x] Record committed-clone install/build/app/MFA and complete setup-rerun preservation acceptance.
- [x] Obtain explicit public-publication/deployment-hook confirmation and publish only the dedicated testing branch.
- [x] Verify fresh GitHub clone, synthetic initialization, app/MFA and full setup-rerun preservation.
- [x] Verify hosted Windows/Ubuntu quality CI at published `ff07351` ([run](https://github.com/rjgrl/collab/actions/runs/39206075312)).
- [ ] Verify physical laptop and hosted/native MongoDB setup/recovery separately; current hosted quality workflow has no real-DB job.

Phase 5: [assessment/owner register](audits/PHASE5_STAGING_READINESS.md). No deployment authorized.

- [x] Restore-verify local source checkpoint and preserve mixed inherited work.
- [x] Validate strict configuration, trusted-peer proxy/cookie simulation and archived-parent file denial.
- [x] Pass expanded browser/artifact gates and offline Windows source-export build/types.
- [x] Measure bounded DB workflows/plans/export boundaries and rerun recovery.
- [ ] Verify proposed edge/TLS/firewall/DB identities, exact proxy peers and private persistent storage in authorized staging.
- [ ] Complete owner privacy/retention/global-access decisions, providers, remote Linux CI, off-host/key/process recovery, long-run capacity and human AT acceptance.

Phase 4 evidence: [report](audits/PHASE4_VALIDATION.md), [recovery runbook](operations/DISASTER_RECOVERY.md), [Forms contract](operations/FORMS_WEBHOOK.md), [permissions/privacy decisions](audits/PERMISSION_MATRIX.md). These complete the bounded local gates, not release approval.

2026-10-19 independent validation: [report](audits/INDEPENDENT_PENTEST.md). PT-01 auth trailing-slash bypass fixed and verified. Local automated gates pass (128 Node / 32 browser / 66 TCP checks); the following gates remain mandatory and incomplete:

- [ ] Complete resource/action authorization and approve global alumni/contact-data visibility, retention and erasure/export policy.
- [ ] Rehearse provider delivery and recovery/key operations with authorized credentials; keep unconfigured delivery and Forms disabled.
- [x] Complete local Forms replay/concurrency/atomicity/fault rollback acceptance; default remains disabled.
- [x] Restore a disposable synthetic MongoDB backup plus private files/build artifacts, checking documents/indexes/relationships and recovery point/time.
- [ ] Approve/test real Forms sender ID/retry/ordering/ingress/retention contract before enabling the integration.
- [ ] Rehearse off-host/service-launch recovery with protected keys, least-privilege accounts, monitoring and accepted production RPO/RTO.
- [ ] Execute remote Linux CI, production signal/TLS/proxy/session-transition checks, sustained realistic load and alerting acceptance.
- [ ] Complete human WCAG 2.2 AA review including screen readers and zoom/reflow; expanded automated scans do not satisfy this gate.

Local preparation only. Do not execute infrastructure changes or deploy from this checklist without separate authorization. Current evidence: [readiness](audits/PRODUCTION_READINESS.md), [tests](audits/TEST_RESULTS.md), [remaining risks](audits/REMAINING_RISKS.md). Record reviewer, date, release SHA and evidence for each gate. Current release decision: **blocked**.

| Gate                                    | Current status | Required evidence                                                                                                                                                                                                                                                            |
| --------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve authentication release blockers | PARTIAL        | MFA enforcement/recovery, password policy/screening/reset and session/abuse controls pass local acceptance. Production recovery/key management, legacy unverified-email recovery and delivery/timing/retry review remain.                                                    |
| Make registration usable                | FAIL           | Real email/SMS ownership verification and approved Google callback/consent tested; no bypass flags.                                                                                                                                                                          |
| Approve permission/data policy          | PARTIAL        | Institutional approval of global Viewer visibility and evidence/export access; complete operation/resource matrix tests.                                                                                                                                                     |
| Reproduce build                         | PARTIAL        | Local types/lint/tests, normal `pnpm build` and artifact check pass. Repeat frozen install/code generation/build on a clean clone, release OS and CI.                                                                                                                        |
| Enforce automated gates                 | PARTIAL        | Pinned read-only workflow prepared and local equivalent commands pass; remote runner, caching and Linux verification not run.                                                                                                                                                |
| Configure service and secrets           | PARTIAL        | Local key generation and production key validation implemented/tested. Production exact HTTPS origins, private secret store, independent MFA key recovery backup, SESSION_SECRET and restricted uploads require operator acceptance. Never copy local bootstrap credentials. |
| Database access and schema              | NOT TESTED     | Authenticated TLS replica set; least-privilege application/backup users; schema/index diff reviewed on disposable snapshot without reset/data-loss flags.                                                                                                                    |
| Back up and restore                     | NOT TESTED     | Paired database/private-file snapshot restored to disposable environment, integrity checked, measured RPO/RTO and rollback rehearsal approved.                                                                                                                               |
| Network and browser headers             | NOT TESTED     | Single HTTPS origin, trusted proxy preserves Origin/Referer, private API/DB ports, edge limits, tested CSP including legitimate Google/reCAPTCHA needs, appropriate HSTS.                                                                                                    |
| Capacity and reliability                | PARTIAL        | Paged lists/export bounds/grouped counts/shared counters and shutdown tests pass. Agree traffic/dataset/SLO assumptions; measure real load/soak, quotas, shared files, edge trust and dependency recovery.                                                                   |
| Monitoring and incident response        | PARTIAL        | Safe structured logs/correlation IDs, alert routing, auth abuse/errors/latency/disk/backup metrics, access-controlled audit retention and incident rehearsal.                                                                                                                |
| Accessibility                           | PARTIAL        | Automated coverage plus manual keyboard, focus, screen reader, 200–400% zoom/reflow and critical form error review.                                                                                                                                                          |
| Privacy and external processors         | NOT TESTED     | Data-owner review of minimization, lawful basis, retention/deletion, provider contracts and residency; approve public photo hosting separately.                                                                                                                              |
| Final acceptance                        | NOT TESTED     | Named authorized reviewer accepts all residual risks and approves controlled release; no automatic publication.                                                                                                                                                              |

## Backup, restore and rollback rehearsal

1. Assign a backup operator, retention/access policy and recovery objectives. Confirm MongoDB tooling/version compatibility. Store encrypted backups outside the application host with separate restricted credentials.
2. Coordinate a consistent database and private-file backup; pause writers or use an approved consistent snapshot procedure. Include private Drive evidence strategy if enabled. Verify backup completion without printing connection secrets.
3. Restore to an explicitly named disposable database and isolated upload directory, never overwrite the working/team database. Check counts, joins, indexes, representative evidence downloads and authorization, then run transaction/write/read tests. Record elapsed restore time, snapshot age and failures.
4. Before any release schema/index change, compare against that restored snapshot and verify code rollback compatibility. Prisma Migrate is not used for this MongoDB app. Do not assume `db push` is a reversible migration or add data-loss flags.
5. Keep the prior release artifact and reviewed configuration accessible. If validation fails, stop rollout, drain requests and return to the prior compatible artifact under operator control. Restore data only through the approved recovery plan; restoring snapshots may discard intervening writes and requires explicit authorization.

## Failure triage and incident preparation

Check `/health/live` for process health and `/health/ready` for the current database ping; readiness does not prove writable primary, mail/SMS availability or storage health. Protect diagnostic dashboards. Observe sanitized error rates and resource saturation before restarting anything. Preserve audit evidence with restricted access and avoid collecting passwords, OTPs, authorization headers or complete session tokens.

For suspected compromise, appoint an incident lead, limit access through the approved edge controls, preserve evidence, identify affected data/accounts, and obtain authorization for revocation/credential rotation or service changes. Rehearse communications, recovery and institutional notification decisions with the data owner. This document does not authorize changes to external systems.
