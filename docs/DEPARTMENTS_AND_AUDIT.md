# Departments and audit history

Departments use names in forms, selectors, REST contracts, CSV import/export and Forms submissions (`departmentName`). Program codes remain required. Imports require an exact active department name and reject ambiguous matches instead of choosing an arbitrary department.

No department code is generated, accepted, or declared by the active model. Historical BSON code fields remain untouched for rollback. Run the normal database migration dry run, then `--apply` before enabling department writes: it retires only the reviewed unique `Department_code_key` index and first saves its complete definition in `MigrationIndexBackup` and the migration report. Other indexes remain intact. Pause application writers during apply and rollback.

`db:migrate --rollback` restores that saved index only when all legacy code values, including missing values, remain unique. Once multiple code-free departments exist, rollback fails safely and requires an operator-reviewed data plan; it never creates codes or rewrites/deletes department records. Restore a pre-change database snapshot with the old application if full rollback is required. Keep the migration report and private database backup.

New audit summaries identify their subject and record allowlisted field changes
using values captured while the mutation runs. Deleted employment and archived
records retain identifying names in their event summaries. Account, role, alumni,
academic, employment, file and import events use the shared writer. Self-service
name edits now also write an event in the same transaction as the change.

The writer copies only the actor's ID, name and email into
`metadata.actorSnapshot`. Audit reads prefer that snapshot over the current user
record, preserving the original identity if an account later changes. Passwords,
password hashes, authenticator secrets, verification codes and session tokens are
excluded from actor snapshots and field-change summaries.

The Audit log shows the recorded timestamp, actor, action, record type/ID and saved
summary, with search and pagination. For older events without an actor snapshot,
the UI explicitly marks a live account lookup as current identity. A missing
account is shown as unavailable, and an absent historical summary remains absent;
the application does not reconstruct past facts from today's records.

Staff role defaults exclude all `integrations.*` permissions. Integration services
and direct page access additionally require an Administrator, so historical Staff
grants do not permit edits. This policy is exercised with default and legacy-grant
browser scenarios as well as API authorization tests; stored role grants are not
rewritten automatically.
