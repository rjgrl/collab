import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createDatabase } from "@Alumni-Tracking-Ss/db";
import { migrateDatabase } from "@Alumni-Tracking-Ss/db/migration";
import {
  beginTimestampEdit,
  commitTimestampEdit,
  readAlumniTimestamps,
  reserveTransactionTimestamp,
  runTimestampOperation,
  timestampOrderingReady,
  timestampOwnerKey,
  TimestampConflictError,
  writeAlumniTimestamps,
} from "@Alumni-Tracking-Ss/db/timestamp-ordering";

if (process.env.NODE_ENV === "production") throw new Error("Synthetic local acceptance only.");
process.env.NODE_ENV = "test";
const name = `collab_timestamp_${randomBytes(8).toString("hex")}`;
const url = `mongodb://127.0.0.1:27018/${name}?replicaSet=rs0`;
const db = createDatabase({ DATABASE_URL: url });
const peer = createDatabase({ DATABASE_URL: url });
const ownerKey = timestampOwnerKey("synthetic-user", "synthetic-session");
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const checks: string[] = [];
const unavailable = (error: unknown) => error instanceof TimestampConflictError;
try {
  assert.equal(await timestampOrderingReady(db), false, "an unmigrated database is not ready");
  assert.deepEqual((await migrateDatabase(db, "apply")).conflicts, []);
  assert.equal(await timestampOrderingReady(db), true);
  await peer.ready();
  const ttl = (await db.TimestampEdit.collection.listIndexes().toArray()).find(
    (index) => index.name === "TimestampEdit_expiresAt_ttl",
  );
  assert.equal(ttl?.expireAfterSeconds, 0);
  checks.push("Additive collections and TTL only for edit contexts");
  const stamps = await Promise.all(
    Array.from({ length: 20 }, (_, index) => reserveTransactionTimestamp(index % 2 ? db : peer)),
  );
  assert.equal(new Set(stamps.map((stamp) => stamp.timestamp)).size, 20);
  assert.equal(new Set(stamps.map((stamp) => stamp.epoch)).size, 1);
  assert.ok(stamps.every((stamp) => stamp.startedAt instanceof Date));
  checks.push("Unique server-issued timestamps across independent connections");
  let abortedTimestamp = 0;
  await assert.rejects(
    () =>
      db.transaction(async () => {
        abortedTimestamp = (await reserveTransactionTimestamp(db)).timestamp;
        throw new Error("Synthetic aborted reservation");
      }),
    /aborted reservation/,
  );
  assert.ok((await reserveTransactionTimestamp(peer)).timestamp > abortedTimestamp);
  checks.push("Transaction abort never rolls the global clock back or reuses its timestamp");
  const college = await db.College.create({ name: "Synthetic" });
  const department = await db.Department.create({ name: "Synthetic", collegeId: college._id });
  const program = await db.Program.create({
    name: "Synthetic",
    code: "SYN",
    departmentId: department._id,
  });
  const [a, b] = await db.Alumni.create([
    { studentNumber: "SYN-A", firstName: "Synthetic", lastName: "A", programId: program._id },
    { studentNumber: "SYN-B", firstName: "Synthetic", lastName: "B", programId: program._id },
  ]);
  assert.ok(a && b);
  const id = String(a._id),
    otherId = String(b._id);
  const read = (tx: typeof db) => tx.Alumni.findById(id).lean().orFail();
  const begin = () => beginTimestampEdit(db, { ownerKey, alumniIds: [id] }, read);
  const beforeReadOnly = await db.AlumniTimestamp.countDocuments();
  await read(db);
  assert.equal(await db.AlumniTimestamp.countDocuments(), beforeReadOnly);
  checks.push("Ordinary reads do not create or advance ordering state");
  const old = await begin();
  const newer = await beginTimestampEdit(peer, { ownerKey, alumniIds: [id] }, read);
  assert.ok(newer.timestamp > old.timestamp);
  assert.equal(
    await db.TimestampEdit.countDocuments({ tokenHash: old.token }),
    0,
    "raw tokens never stored",
  );
  await assert.rejects(
    () =>
      commitTimestampEdit(db, { ownerKey, token: old.token, alumniIds: [id] }, read, async (tx) => {
        await tx.Alumni.updateOne({ _id: id }, { $set: { batch: "must not commit" } });
      }),
    unavailable,
  );
  assert.notEqual((await read(db)).batch, "must not commit");
  assert.equal(
    (
      await db.TimestampEdit.findOne({ tokenHash: hash(old.token) })
        .lean()
        .orFail()
    ).consumedAt ?? null,
    null,
  );
  checks.push(
    `T${old.timestamp} write rejected after T${newer.timestamp} read, even without a new write`,
  );
  await commitTimestampEdit(
    peer,
    { ownerKey, token: newer.token, alumniIds: [id] },
    read,
    async (tx) => {
      await tx.Alumni.updateOne({ _id: id }, { $set: { batch: "newer committed" } });
    },
  );
  assert.equal((await read(db)).batch, "newer committed");
  await assert.rejects(
    () =>
      commitTimestampEdit(
        db,
        { ownerKey, token: newer.token, alumniIds: [id] },
        read,
        async () => true,
      ),
    unavailable,
  );
  checks.push("Successful context is consumed once; replay rejected");
  const beforeStamp = await reserveTransactionTimestamp(db);
  await runTimestampOperation(peer, [id], read, async (tx) => {
    await tx.Alumni.updateOne({ _id: id }, { $set: { batch: "server operation" } });
  });
  await assert.rejects(
    () => db.transaction((tx) => readAlumniTimestamps(tx, beforeStamp, [id])),
    unavailable,
  );
  await assert.rejects(
    () => db.transaction((tx) => writeAlumniTimestamps(tx, beforeStamp, [id])),
    unavailable,
  );
  checks.push("Older reads and writes rejected after a newer committed write");
  const privateEdit = await begin();
  await assert.rejects(
    () =>
      commitTimestampEdit(
        db,
        {
          ownerKey: timestampOwnerKey("another-user", "another-session"),
          token: privateEdit.token,
          alumniIds: [id],
        },
        read,
        async () => true,
      ),
    unavailable,
  );
  await assert.rejects(
    () =>
      commitTimestampEdit(
        db,
        {
          ownerKey: timestampOwnerKey("synthetic-user", "rotated-session"),
          token: privateEdit.token,
          alumniIds: [id],
        },
        read,
        async () => true,
      ),
    unavailable,
  );
  await assert.rejects(
    () =>
      commitTimestampEdit(
        db,
        { ownerKey, token: privateEdit.token, alumniIds: [otherId] },
        read,
        async () => true,
      ),
    unavailable,
  );
  checks.push("Contexts cannot be used by another actor/session or for uncovered alumni");
  await db.TimestampEdit.updateOne(
    { tokenHash: hash(privateEdit.token) },
    { $set: { expiresAt: new Date(0) } },
  );
  await assert.rejects(
    () =>
      commitTimestampEdit(
        db,
        { ownerKey, token: privateEdit.token, alumniIds: [id] },
        read,
        async () => true,
      ),
    unavailable,
  );
  checks.push("Expiry enforced even before physical TTL cleanup");
  const rollback = await begin();
  const snapshot = await read(db);
  const auditCount = await db.AuditLog.countDocuments();
  const state = await db.AlumniTimestamp.findOne({ key: id }).lean().orFail();
  await assert.rejects(
    () =>
      commitTimestampEdit(
        db,
        { ownerKey, token: rollback.token, alumniIds: [id] },
        read,
        async (tx) => {
          await tx.Alumni.updateOne({ _id: id }, { $set: { batch: "rollback" } });
          await tx.AuditLog.create({
            action: "alumni.update",
            entity: "alumni",
            entityId: id,
            summary: "Synthetic rollback",
          });
          throw new Error("Synthetic mutation failure");
        },
      ),
    /Synthetic mutation failure/,
  );
  assert.equal((await read(db)).batch, snapshot.batch);
  assert.equal(await db.AuditLog.countDocuments(), auditCount);
  assert.equal(
    (await db.AlumniTimestamp.findOne({ key: id }).lean().orFail()).writeTimestamp,
    state.writeTimestamp,
  );
  assert.equal(
    (
      await db.TimestampEdit.findOne({ tokenHash: hash(rollback.token) })
        .lean()
        .orFail()
    ).consumedAt ?? null,
    null,
  );
  checks.push("Business data, audit, write timestamp and consumption roll back atomically");
  const denied = await begin();
  await assert.rejects(
    () =>
      commitTimestampEdit(
        db,
        { ownerKey, token: denied.token, alumniIds: [id] },
        async () => {
          throw new Error("Synthetic current-scope denial");
        },
        async () => true,
      ),
    /current-scope denial/,
  );
  assert.equal(
    (
      await db.TimestampEdit.findOne({ tokenHash: hash(denied.token) })
        .lean()
        .orFail()
    ).consumedAt ?? null,
    null,
  );
  checks.push("Current authorization is checked before consuming or claiming a context");
  const batch = await beginTimestampEdit(db, { ownerKey, alumniIds: [id, otherId] }, async (tx) =>
    tx.Alumni.find({ _id: { $in: [id, otherId] } }).lean(),
  );
  await beginTimestampEdit(peer, { ownerKey, alumniIds: [otherId] }, async (tx) =>
    tx.Alumni.findById(otherId).lean().orFail(),
  );
  const beforeBatch = await db.AlumniTimestamp.findOne({ key: id }).lean().orFail();
  await assert.rejects(
    () =>
      commitTimestampEdit(
        db,
        { ownerKey, token: batch.token, alumniIds: [id, otherId] },
        read,
        async (tx) =>
          tx.Alumni.updateMany(
            { _id: { $in: [id, otherId] } },
            { $set: { batch: "partial forbidden" } },
          ),
      ),
    unavailable,
  );
  assert.equal(
    (await db.AlumniTimestamp.findOne({ key: id }).lean().orFail()).writeTimestamp,
    beforeBatch.writeTimestamp,
  );
  assert.equal(await db.Alumni.countDocuments({ batch: "partial forbidden" }), 0);
  checks.push("A conflict in one resource aborts the entire multi-alumnus operation");
  const independent = await begin();
  await beginTimestampEdit(peer, { ownerKey, alumniIds: [otherId] }, async (tx) =>
    tx.Alumni.findById(otherId).lean().orFail(),
  );
  await commitTimestampEdit(
    db,
    { ownerKey, token: independent.token, alumniIds: [id] },
    read,
    async (tx) => tx.Alumni.updateOne({ _id: id }, { $set: { batch: "independent" } }),
  );
  checks.push("Different alumni remain independent");
  await db.TimestampClock.updateOne({}, { $set: { epoch: "synthetic-inconsistent-restore" } });
  await assert.rejects(
    () => begin(),
    (error: unknown) => error instanceof TimestampConflictError && error.status === 503,
  );
  checks.push("Inconsistent clock/resource restore fails closed");
  console.log(
    JSON.stringify(
      {
        checks,
        result: "PASS",
        limitations: [
          "Synthetic loopback database only",
          "Core infrastructure; application paths and browser integration verified separately",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  if (db.connection.db?.databaseName === name) await db.connection.dropDatabase();
  await Promise.all([db.disconnect(), peer.disconnect()]);
}
