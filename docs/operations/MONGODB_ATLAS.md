# MongoDB Atlas (hosted environments)

Staging and production use MongoDB Atlas. Local development and every automated test keep the
native replica set (`rs0` on `127.0.0.1:27018`); never point `pnpm setup:local`, `pnpm test` or
`pnpm test:browser` at Atlas.

The application needs no Atlas-specific code. `DATABASE_URL` is the only database setting, and
the production validator already requires credentials and verified TLS, which a `mongodb+srv://`
Atlas string provides. Transactions work on every Atlas cluster tier (all are replica sets).

## 1. Prepare Atlas (once per environment)

1. Create a project and a cluster (M10 or larger for production; M0/Flex only for demos, which have
   connection and throughput limits). Choose the region closest to the application server.
2. **Database Access** → add a database user with password authentication and the built-in role
   `readWrite` on the application database only (for example `alumni_tracking`). Do not use
   `atlasAdmin`. Generate a long random password.
3. **Network Access** → add only the application server's public egress IP (and, temporarily, the
   migration device's IP). Do not add `0.0.0.0/0`.
4. **Connect → Drivers** → copy the `mongodb+srv://` string and add the database name to the
   path:

   ```text
   mongodb+srv://<credentials>@<cluster>.<id>.mongodb.net/alumni_tracking?retryWrites=true&w=majority
   ```

   `<credentials>` is the Atlas user name and password joined by a colon, exactly as Atlas shows
   them; URL-encode special characters in the password. Never add `tlsAllowInvalidCertificates` or
   `tlsInsecure`; the server refuses to start with them.

## 2. Configure the application server

Put the string in the server's private environment (secret store or `apps/server/.env` on the host,
never in Git), next to the existing keys:

```dotenv
DATABASE_URL=mongodb+srv://...mongodb.net/alumni_tracking?retryWrites=true&w=majority
```

The data is only usable with the **same** keys it was written with. When moving an existing
database, copy these values unchanged from the source deployment:

- `MFA_ENCRYPTION_KEY` (authenticator secrets),
- `INTEGRATION_ENCRYPTION_KEY` (integration credentials),
- `BACKUP_ENCRYPTION_KEY` (only to restore older `.atsbak` backups),
- `SESSION_SECRET` (otherwise everyone is simply signed out).

Uploaded files stored locally live in `UPLOAD_DIR`, not in MongoDB. Copy that directory to the new
host as well; Google Drive and ImgBB files need nothing.

Verify before starting the app (on the server, with the environment loaded):

```bash
pnpm --filter @Alumni-Tracking-Ss/db db:verify-transactions   # rollback-only probe
pnpm --filter @Alumni-Tracking-Ss/db db:migrate --dry-run     # reports, writes nothing
```

## 3. Later: migrate the presentation data to Atlas

Run this on the device that holds the presentation data. It copies the database as-is; nothing is
transformed. Install the pinned tools first with `pnpm tools:mongodb`.

The connection strings go in two private config files so they never appear in shell history or
the process list. Create them in a private folder outside the repository and delete them at the
end.

`source.yaml` (the presentation device's local database):

```yaml
uri: mongodb://127.0.0.1:27018/alumni_tracking?replicaSet=rs0
```

`atlas.yaml`:

```yaml
uri: mongodb+srv://<credentials>@<cluster>.<id>.mongodb.net/alumni_tracking?retryWrites=true&w=majority
```

Use the real database name from that device's `apps/server/.env` (`DATABASE_URL`) in
`source.yaml` (new clones use `collab_dev_...`).

### Windows (PowerShell)

```powershell
$tools = Resolve-Path .tools/mongodb-database-tools-windows-x86_64-100.20.1/bin
$work  = "$env:USERPROFILE\atlas-migration"        # holds source.yaml, atlas.yaml and the dump
$src   = "collab_dev_xxxxxxxxxxxx"                  # source database name
$dst   = "alumni_tracking"                          # Atlas database name

# 1. Stop the local app so nothing writes during the copy.
# 2. Dump (BackupState holds this server's backup locks and schedule slots; leave it behind).
& "$tools\mongodump.exe" --config "$work\source.yaml" --db $src `
  --excludeCollection BackupState --gzip --archive="$work\presentation.archive"

# 3. Restore into Atlas, renaming the database if the names differ.
& "$tools\mongorestore.exe" --config "$work\atlas.yaml" --gzip --archive="$work\presentation.archive" `
  --nsFrom "$src.*" --nsTo "$dst.*" --drop --stopOnError
```

### Linux / macOS (bash)

```bash
tools=.tools/mongodb-database-tools-ubuntu2204-x86_64-100.20.1/bin
work=~/atlas-migration; src=collab_dev_xxxxxxxxxxxx; dst=alumni_tracking
"$tools/mongodump" --config "$work/source.yaml" --db "$src" \
  --excludeCollection BackupState --gzip --archive="$work/presentation.archive"
"$tools/mongorestore" --config "$work/atlas.yaml" --gzip --archive="$work/presentation.archive" \
  --nsFrom "$src.*" --nsTo "$dst.*" --drop --stopOnError
```

`--drop` replaces collections that already exist in the Atlas database; run it only against an
empty or disposable target. `mongorestore` must report a non-zero document count; zero usually
means the `--nsFrom` name is wrong.

### Verify

With `DATABASE_URL` set to the Atlas string in the current shell (PowerShell:
`$env:DATABASE_URL = "..."`; remove it afterwards):

```bash
pnpm --filter @Alumni-Tracking-Ss/db db:migrate --dry-run   # no missing indexes or conflicts
pnpm --filter @Alumni-Tracking-Ss/db db:migrate --apply     # only if the dry run lists missing indexes
pnpm --filter @Alumni-Tracking-Ss/db db:check-references    # must report no broken references
```

Compare document counts between source and Atlas, collection by collection (Compass shows them,
or `mongosh` with `db.getCollectionNames().map(n => [n, db[n].countDocuments()])` on both). Then
start the app against Atlas and check: sign in as a Super Admin (authenticator code accepted
means `MFA_ENCRYPTION_KEY` matches), open an alumni profile with a photo and evidence, open
Settings › Integrations (no "key mismatch" means `INTEGRATION_ENCRYPTION_KEY` matches), and take a
backup from Settings › Backups.

### Clean up

- Delete `source.yaml`, `atlas.yaml` and `presentation.archive` (the archive contains all personal
  data unencrypted).
- Remove the migration device's IP from Atlas Network Access.
- Rotate the Atlas user's password if the config files were ever copied elsewhere.

### Roll back

Atlas is a copy; the source database is untouched. To roll back, point `DATABASE_URL` back at
the previous database and restart. Writes made in Atlas after the switch are not copied back.

## Notes

- In-app backups (`.atsbak`) work against Atlas: `mongodump`/`mongorestore` use `DATABASE_URL`.
  Atlas's own cloud backups (M10+) are an additional, independent layer; enabling them is a
  deployment decision.
- The Atlas user needs only `readWrite` on the application database; in-app restore drops and
  recreates its collections, which `readWrite` allows.
