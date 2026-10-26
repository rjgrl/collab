# Forms delivery, idempotency and retry contract

**Default enablement remains off.** Verify the sender contract and operational policy in isolated staging before enabling real deliveries. Local checks do not establish live provider acceptance.

Prerequisites before any separately authorized enablement:

1. Follow the [migration runbook](../migrations/MONGOOSE_REST.md): inspect `pnpm db:migrate --dry-run`, back up the intended database and uploads, then apply only the reviewed plan with target-specific authorization using `pnpm db:migrate --apply`. Confirm the `FormsReceipt_keyHash_key` unique index before enabling deliveries. Mongoose needs no generated client.
2. Configure a high-entropy `GOOGLE_FORMS_WEBHOOK_SECRET`, sender identity, TLS, ingress limits and secret rotation process. A missing secret now rejects requests in development as well as production. Secret comparisons use equal-length timing-safe comparison.
3. Implement the sender contract below and approve replay/retention/monitoring policy. Passing local tests does not configure Google or authorize provider traffic.

POST JSON to `/api/integrations/google-forms/webhook` with:

- `x-webhook-secret`: configured secret.
- `Idempotency-Key`: a stable **16–128 ASCII character** ID using letters, digits, `_ . : -`. Include a form identifier plus response identifier. Reuse exactly this ID and the same business payload on every retry; do not generate a new ID per delivery attempt. A real edit is a new version/event ID.

One MongoDB transaction creates the hashed receipt, upserts the alumni record/tracking state and records the completed import job. Receipt `keyHash` is unique. Neither raw response IDs nor raw payloads are kept in the receipt. A digest of the validated/mapped business fields binds the ID to its contents; hashes are not a guarantee of anonymization. The transaction never commits a receipt for a failed import.

| Response                                    | Sender behavior                                                                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 200, replayed=false                         | Committed. Record returned importJobId and stop retrying                                                                                           |
| 200, replayed=true                          | Previously committed. Same importJobId; no second update/job/tracking effect                                                                       |
| 400                                         | Invalid payload/key/domain state, including archived alumni; investigate and fix. Use a new version ID if changing a previously accepted event     |
| 401 / 403                                   | Secret/configuration/enablement issue; halt and alert operator                                                                                     |
| 409                                         | Accepted ID reused with different mapped business data; investigate, never silently replace                                                        |
| 503 with Retry-After                        | Bounded transaction contention; retry the original ID/payload after the indicated interval with bounded exponential backoff and jitter             |
| Other 5xx / network timeout / lost response | Result may be unknown. Retry the **same ID and payload** with bounded backoff; the durable receipt resolves a committed-but-unacknowledged attempt |

The server makes at most three immediate retries for known unique/write conflicts; it does not retry arbitrary exceptions indefinitely. It has no background delivery queue. Sender retry deadlines, dead-letter handling and alert ownership still need provider acceptance. Operational failures return generic messages rather than database diagnostics.

Distinct response IDs for the same student are distinct events; the unique student number preserves one alumni record. Existing importer semantics for employment/tracking remain; this work does not define event ordering across distinct real updates. Replaying an older accepted response after a newer update does not overwrite that update. Archived records are rejected instead of silently modified.

Receipts must be included in backups and restored with their import jobs and alumni state. Do not expire/drop them or rotate the key namespace without an approved replay horizon and reconciliation plan: doing so permits old submissions to apply again. Partial restore of only alumni is insufficient. A restore to an earlier recovery point cannot remember receipts committed after that point; reconcile sender state before reopening deliveries.

Compatibility: webhook senders without Idempotency-Key now receive 400; unconfigured-secret development requests now receive 401. CSV/Sheets batch imports retain their existing row-wise behavior and are not made atomic by this change. This design provides idempotent database effects for a retained submission ID, not global exactly-once provider delivery.

Acceptance: `pnpm test:forms-db` uses real loopback TCP, two independent Mongoose connections, disposable replica-set databases and fault injection. It checks disabled/missing-secret/invalid submissions, serial and concurrent duplicate delivery, changed payload conflict, complete rollback after writes, safe retries, distinct IDs for one student, archived-record rejection and stale replay after a newer update. Run the [local recovery rehearsal](DISASTER_RECOVERY.md) to check receipt replay protection after restoration. Live sender retries, retention and production recovery still require separate acceptance.
