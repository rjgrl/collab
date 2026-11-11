# Local synthetic disaster recovery rehearsal

This is a bounded development rehearsal, not a production backup service. `pnpm test:recovery-local` generates new `collab_recovery_source_<random>` and `collab_recovery_target_<random>` databases on loopback 27018 / `rs0`; it accepts no caller-supplied database name. It refuses NODE_ENV=production, verifies the target has no collections and never uses `--drop`, an existing application database or private environment files.

Install the pinned official MongoDB Database Tools 100.20.1 package with `pnpm tools:mongodb`. The installer supports Windows and Ubuntu x64, verifies the platform archive against the reviewed SHA-256 before extraction under ignored `.tools/`, prints the tool version and exports `MONGODB_TOOLS_DIR` in GitHub Actions.

Reproduce after dependency installation, environment type generation and a local build:

```powershell
pnpm tools:mongodb
pnpm build
$env:MONGODB_TOOLS_DIR = (Resolve-Path .tools/mongodb-database-tools-windows-x86_64-100.20.1/bin)
pnpm test:recovery-local
```

For another OS/architecture, install reviewed compatible Database Tools through its approved workflow and set `MONGODB_TOOLS_DIR` to its bin directory. Validate the chosen OS/tool combination independently. Read the [official restore documentation](https://www.mongodb.com/docs/database-tools/mongorestore/) before adapting commands; an archive restore can report success with zero documents if namespace filtering is wrong.

The script:

1. Creates protected, uniquely named `.tools/recovery-<random>/` output. Windows inheritance is removed and access granted only to the current SID and SYSTEM. Unix uses owner-only modes, but that branch was not exercised here.
2. Creates schema/indexes only in the new source and inserts related synthetic academic/alumni/employment/tracking/file/job/receipt records. It stops writing while snapshotting/dumping.
3. Captures all small fixture documents and index definitions, preserving compound-index key order. Synthetic cursor/archive/runtime-size bounds prevent accidentally treating this as a general database dumper.
4. Streams gzip archive bytes from `mongodump` into bounded memory. Bundles a synthetic evidence file, complete built server/web directories, schema, manifest and lockfile. No private configuration, real MFA key or live data is included.
5. Encrypts the bundle with AES-256-GCM and account-independent rehearsal AAD. Stores ciphertext under `backup/`, and its random key under separate `keys/`. No plaintext database archive is written to disk. A corrupted ciphertext must fail authentication.
6. Confirms the target is still empty, decrypts in memory and runs `mongorestore --archive --gzip --nsInclude source.* --nsFrom source.* --nsTo target.* --stopOnError` against the loopback server. The URI deliberately contains no database filter; namespace mapping determines the new target.
7. Restores files into new directories, compares every fixture document/index and runtime-file hash, resolves application relationships, downloads the evidence through the private-file reader, proves unique-index enforcement and checks restored Forms receipts suppress replay without changes.

The output is an ignored, ACL-protected result.json with counts/timings/hashes and explicit limits. Keep this output private; it is rehearsal evidence, not a production backup.

## Recovery point and recovery time

The script reports synthetic document/index/file counts and dump/restore validation timings. This tiny same-host fixture cannot establish a production RTO commitment. Provisioning, incident detection, download, human approval, service launch and user acceptance are excluded.

The source is quiesced for the dump; no online multi-collection consistency or point-in-time/oplog guarantee is claimed. A deliberate post-backup alumni write is absent in the target, demonstrating the recovery-point boundary. Real RPO depends on backup schedule, successful verification, concurrent-write strategy and sender reconciliation. No accepted operational RPO/RTO targets exist yet.

## Remaining production gates

- Restore on a clean separate machine/site with the real runtime/dependency installation and approved keys/configuration; built artifacts were restored and hashed, not launched.
- Store encrypted backups off-host/immutably and keys in a separately controlled recovery system. Two folders on one development host do not protect against host loss or a compromised local account.
- Verify least-privilege database/service identities, restore-account permissions and another OS principal's denied access. The local server is an unauthenticated loopback development replica set; it does not demonstrate production database access control.
- Establish consistent live backups, schedules, retention/deletion, freshness/failure monitoring, alerts, restore ownership, rehearsal frequency and documented RPO/RTO acceptance.
- Restore evidence, databases, Forms receipts and application version together. Follow [account security](ACCOUNT_SECURITY.md) for key/session compatibility; do not discard receipts/keys as a recovery shortcut. The in-app restore described below is the only approved way to overwrite the live database.

## In-app backup and restore (Settings › Backups)

The owner approved restoring over the live database from inside the application (see `docs/decisions.md`, 2026-11-09). This supersedes the earlier "never overwrite a real database" rule for this one, guarded path. The rehearsal above remains the way to test a restore onto a separate machine.

Server configuration (private environment only, never in the database or a backup):

- `BACKUP_ENCRYPTION_KEY`: 64 hex characters (`openssl rand -hex 32`), different from `MFA_ENCRYPTION_KEY`, `SESSION_SECRET` and `INTEGRATION_ENCRYPTION_KEY`.
- `BACKUP_DIR`: absolute directory outside `UPLOAD_DIR` and the web build. It holds `<id>.atsbak` (encrypted), `<id>.json` (catalog: dates, counts, versions, key fingerprints; no data) and the append-only `restore-log.jsonl`.
- `MONGODB_TOOLS_DIR`: the MongoDB Database Tools `bin` directory (`mongodump`, `mongorestore`). Run `pnpm tools:mongodb` to install and verify the pinned official 100.20.1 package on Windows or Ubuntu x64.

What a backup contains: a gzip `mongodump` archive of the application database (except the `BackupState` collection), every regular file under `UPLOAD_DIR` (evidence and account photos stored locally; files kept in Google Drive or ImgBB are not copied), and a manifest (collection counts, file hashes, app version, `SCHEMA_VERSION`, fingerprints of the MFA and integration keys). Environment files, `.tools/` and key material are never included. The file is sealed in 1 MiB AES-256-GCM chunks whose AAD binds the backup ID, chunk index and final flag, so tampering, reordering or truncation is detected before any data is used. Every backup is decrypted and its hashes re-checked right after it is written ("Verified").

Schedule: off, daily or weekly at a time in Asia/Manila (UTC+8), keeping the newest N scheduled backups (manual and pre-restore backups are never pruned). The schedule lives in the database; each server instance checks it every minute, but a slot claim and a lock in `BackupState` make sure only one instance runs a given backup. Scheduled and manual failures notify every active Super Admin and are audited.

Off-host copy: when Google Drive is enabled with readable credentials, the server uploads the already-encrypted `.atsbak` file to the configured folder using a resumable Drive upload. The catalog records `copied`, `failed` or `skipped`, and Settings shows that result. A Drive failure never converts a verified local backup into a failed backup; operators must monitor the off-host status.

Restore (Super Admin with an MFA-verified session):

1. Pick a verified backup. The dialog shows its manifest and versions. A backup with a newer schema version, or one made with a different `MFA_ENCRYPTION_KEY` or `INTEGRATION_ENCRYPTION_KEY`, is refused (restored authenticators or credentials would be unreadable).
2. Enter a current authenticator code (a fresh step-up check; recovery codes are not accepted) and type `RESTORE`.
3. The server makes and verifies a pre-restore backup, turns on maintenance mode (every non-Super-Admin API request gets 503 except the password/Google sign-in, MFA verification, session check and sign-out routes), runs `mongorestore --drop --stopOnError`, restores files into a staging directory and swaps it in, runs pending migrations, deletes every session, and turns maintenance off. Everyone, including the operator, signs in again.
4. If any step fails, the pre-restore backup is restored the same way. If that also fails, maintenance mode stays on and the status shows the failed step; fix the cause and restore the pre-restore backup again.
5. If the server process stops during a restore, the next startup marks the restore failed, expires its stale restore lock and deliberately leaves maintenance mode on. After inspecting the database/files or running another restore, a verified Super Admin can use **End maintenance mode**; that action is audited.
6. The restore is written to `restore-log.jsonl` and, because the audit log itself was replaced, re-recorded in the audit log afterwards.

Check it locally with `pnpm test:backup-local` (generated databases on rs0/27018 only: backup, change data, restore, compare; corrupted file; forced mid-restore failure and rollback; interrupted-process recovery; two scheduler instances; 403/503 access; and a real HTTP restore submitted with a generated TOTP). CI runs this on Windows and Ubuntu.

Limits: restore currently selects a backup already present in the server catalog; uploading an `.atsbak` from another host is not implemented. `BACKUP_DIR` on the same host does not protect against host loss unless the Google Drive copy succeeds. No point-in-time/oplog consistency is claimed; writes during a backup may or may not be included. RPO/RTO targets are still to be agreed.
