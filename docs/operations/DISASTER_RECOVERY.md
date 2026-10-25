# Local synthetic disaster recovery rehearsal

This is a bounded development rehearsal, not a production backup service. `pnpm test:recovery-local` generates new `collab_recovery_source_<random>` and `collab_recovery_target_<random>` databases on loopback 27018 / `rs0`; it accepts no caller-supplied database name. It refuses NODE_ENV=production, verifies the target has no collections and never uses `--drop`, an existing application database or private environment files.

MongoDB Database Tools 100.19.1 were downloaded as a portable ZIP from the [official archive](https://www.mongodb.com/try/download/database-tools/releases/archive), into ignored `.tools/database-tools-100.19.1/`. No system PATH, service or administrator installation was changed. Observed ZIP SHA-256: `527738a0f9ab2d80ea40cb8fc7a68f8e28664a2fd4e3b63626c2d4629aeb7f37`. This is a recorded download digest, not independent vendor-signature verification. Successful local operation was observed with MongoDB 9.0.2; do not infer a vendor support promise for other version combinations.

Reproduce in PowerShell after dependency installation, environment type generation and a local build:

```powershell
pnpm build
$env:MONGODB_TOOLS_DIR = (Get-ChildItem .tools/database-tools-100.19.1 -Recurse -Filter mongodump.exe | Select-Object -First 1).DirectoryName
pnpm test:recovery-local
```

For another OS, install reviewed compatible Database Tools through its approved workflow and set MONGODB_TOOLS_DIR to its bin directory. This pass verified Windows only. Read the [official restore documentation](https://www.mongodb.com/docs/database-tools/mongorestore/) before adapting commands; an archive restore can report success with zero documents if namespace filtering is wrong.

The script:

1. Creates protected, uniquely named `.tools/recovery-<random>/` output. Windows inheritance is removed and access granted only to the current SID and SYSTEM. Unix uses owner-only modes, but that branch was not exercised here.
2. Creates schema/indexes only in the new source and inserts related synthetic academic/alumni/employment/tracking/file/job/receipt records. It stops writing while snapshotting/dumping.
3. Captures all small fixture documents and index definitions, preserving compound-index key order. Synthetic cursor/archive/runtime-size bounds prevent accidentally treating this as a general database dumper.
4. Streams gzip archive bytes from `mongodump` into bounded memory. Bundles a synthetic evidence file, complete built server/web directories, schema, manifest and lockfile. No private configuration, real MFA key or live data is included.
5. Encrypts the bundle with AES-256-GCM and account-independent rehearsal AAD. Stores ciphertext under `backup/`, and its random key under separate `keys/`. No plaintext database archive is written to disk. A corrupted ciphertext must fail authentication.
6. Confirms the target is still empty, decrypts in memory and runs `mongorestore --archive --gzip --nsInclude source.* --nsFrom source.* --nsTo target.* --stopOnError` against the loopback server. The URI deliberately contains no database filter; namespace mapping determines the new target.
7. Restores files into new directories, compares every fixture document/index and runtime-file hash, resolves application relationships, downloads the evidence through the private-file reader, proves unique-index enforcement and checks restored Forms receipts suppress replay without changes.

The output is an ignored, ACL-protected result.json with counts/timings/hashes and explicit limits. A sanitized snapshot is committed as documentation evidence, not as a backup. No database or rehearsal output was deleted during this phase.

## Recovery point and recovery time

The 2026-10-23 completion run restored nine documents across 22 collections and 59 index definitions, plus 66 required files (5,234,465 bytes). Dump time was 74.26 ms; measured restore plus validation was 2,028.27 ms. The fixture starts tracked to match its initial tracking event; replay assertions remain intact. This is a tiny same-host fixture, not a production RTO commitment. Provisioning, incident detection, download, human approval, service launch and user acceptance are excluded.

The source is quiesced for the dump; no online multi-collection consistency or point-in-time/oplog guarantee is claimed. A deliberate post-backup alumni write is absent in the target, demonstrating the recovery-point boundary. Real RPO depends on backup schedule, successful verification, concurrent-write strategy and sender reconciliation. No accepted operational RPO/RTO targets exist yet.

## Remaining production gates

- Restore on a clean separate machine/site with the real runtime/dependency installation and approved keys/configuration; built artifacts were restored and hashed, not launched.
- Store encrypted backups off-host/immutably and keys in a separately controlled recovery system. Two folders on one development host do not protect against host loss or a compromised local account.
- Verify least-privilege database/service identities, restore-account permissions and another OS principal's denied access. The local server is an unauthenticated loopback development replica set; it does not demonstrate production database access control.
- Establish consistent live backups, schedules, retention/deletion, freshness/failure monitoring, alerts, restore ownership, rehearsal frequency and documented RPO/RTO acceptance.
- Restore evidence, databases, Forms receipts and application version together. Follow the account-security key/session compatibility runbook; never overwrite a real database or discard receipts/keys as a recovery shortcut.
