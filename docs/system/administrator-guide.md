# Administrator guide

## Accounts and roles

Settings groups Account, Members, Roles and permissions, and Integrations. Each action requires its permission; system-role management is restricted to Super Admin. Create accounts with separate names, email, password and assigned roles. Disable accounts instead of deleting them. System roles cannot be deleted, and Super Admin accounts/assignments retain additional protections. Changes to password, status and role assignments revoke affected sessions.

Administrator roles (`super_admin` and `admin`) require MFA normally, including mixed roles. Managed local development currently pauses it with LOCAL_DISABLE_MFA=true; production rejects this setting. Staff and Alumni do not require enrollment or challenge, even with stored authenticator credentials. Optional enrollment remains available. Required contact verification, password checks, sessions and permissions still apply.

New Admin-created accounts confirm their missing contact/name details at first access and require contact verification in strict mode. Public signup creates an Alumni profile directly; the following review workflow applies to legacy/imported claims.

## Explicit alumni linking

1. Verify identity and the student number against an active alumni record.
2. Have the account's structured names confirmed in Account settings or through an authorized account edit; do not split its legacy display name.
3. An Administrator with both `users.write` and `alumni.write`, completed verification and required MFA opens Settings > Members > Link alumni profile.
4. Select the reviewed record and confirm. Conflicting links and duplicate claims are rejected. A unique partial database index enforces one account per alumni record.

Account names become authoritative and synchronize transactionally to the linked profile, including when the account is disabled. Edit linked names through the account. Name/email similarity never links accounts automatically. Alumni gain only their own permitted profile access; linkage does not grant management rights.

## Operations

- Review audit entries for sign-in, account/role changes, alumni edits, uploads and integrations.
- Back up the database, private upload volume and separately protected encryption keys. Rehearse restore into an isolated environment.
- Review the dry-run index migration before authorizing additive changes; startup never changes indexes automatically. Do not reset or reseed an existing database.
- Express request logs include only generated request ID, method, status/category and duration. Error responses withhold database diagnostics and credentials. Never log verification codes or provider secrets.
- Keep optional integrations disabled until provider acceptance. SMS is unimplemented; strict contact verification and production readiness remain blocked. Local contact exemptions permit functionality tests without falsifying verification state.
- Integrations are Administrator-only regardless of historical Staff grants. New Staff presets omit both integration permissions. There are no direct-user grants; other permissions remain the union of assigned roles.
- Archiving an alumnus keeps its account/history but blocks owned profile and evidence access. It does not silently disable or delete the User; review account status separately.

Read [account security operations](../operations/ACCOUNT_SECURITY.md), [deployment](../deployment.md), [migration and rollback](../migrations/MONGOOSE_REST.md) and [verification evidence](../MIGRATION_VERIFICATION.md) before release. Repository seeding refuses production; existing production administrators are retained, and new provisioning requires a reviewed operator process.
