import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createDatabase } from "@Alumni-Tracking-Ss/db";
import { migrateDatabase } from "@Alumni-Tracking-Ss/db/migration";
import { seedDatabase } from "@Alumni-Tracking-Ss/db/seed-data";
import { findBrokenReferences } from "@Alumni-Tracking-Ss/db/reference-check";
import { MissingReferenceError } from "@Alumni-Tracking-Ss/db/reference-integrity";
import { runIntegrityTick } from "@Alumni-Tracking-Ss/api/integrity";
import { startCiReplicaSet } from "./ci-replica-set";

// Reference integrity on a real replica set, against a generated database only.
if (process.env.NODE_ENV === "production") throw new Error("Synthetic local acceptance only.");
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = `mongodb://127.0.0.1:27018/collab_integrity_${randomBytes(6).toString("hex")}?replicaSet=rs0`;
process.env.SEED_ADMIN_EMAIL = "synthetic-admin@example.test";
process.env.SEED_ADMIN_PASSWORD = randomBytes(24).toString("base64url");
process.env.SEED_DEMO_DATA = "true";
delete process.env.STAFF_EMAIL_DOMAINS;
delete process.env.INTEGRATION_ENCRYPTION_KEY;
const stopCiReplicaSet = await startCiReplicaSet();
const db = createDatabase({ DATABASE_URL: process.env.DATABASE_URL });
// The Mongoose instance behind the connection; apps/server does not depend on mongoose directly.
const { Types } = db.connection.base;
const missing = () => new Types.ObjectId();
const rejectsMissing = (work: () => Promise<unknown>, reference: string) =>
  assert.rejects(work, (error: unknown) => {
    assert.ok(error instanceof MissingReferenceError, String(error));
    assert.equal(`${error.model}.${error.field}`, reference);
    return true;
  });
try {
  assert.deepEqual((await migrateDatabase(db, "apply")).conflicts, []);
  await seedDatabase(db);
  assert.deepEqual(await findBrokenReferences(db), [], "a fresh seeded database is consistent");
  const program = await db.Program.findOne({}).orFail().lean();
  const alumni = await db.Alumni.findOne({}).orFail().lean();
  const role = await db.Role.findOne({}).orFail().lean();
  const user = await db.User.findOne({}).orFail().lean();

  // 1. Create, insertMany and update refuse references to missing documents.
  await rejectsMissing(
    () =>
      db.Alumni.create({
        studentNumber: "REF-1",
        firstName: "A",
        lastName: "B",
        programId: missing(),
      }),
    "Alumni.programId",
  );
  await rejectsMissing(
    () => db.UserRole.insertMany([{ userId: user._id, roleId: missing() }]),
    "UserRole.roleId",
  );
  await rejectsMissing(
    () => db.Alumni.updateOne({ _id: alumni._id }, { $set: { programId: missing() } }).exec(),
    "Alumni.programId",
  );
  await rejectsMissing(
    () =>
      db.Employment.findOneAndUpdate(
        { alumniId: missing() },
        { $setOnInsert: { alumniId: missing(), employer: "X" } },
        { upsert: true },
      ).exec(),
    "Employment.alumniId",
  );
  assert.equal(await db.Alumni.countDocuments({ studentNumber: "REF-1" }).exec(), 0);

  // 2. Valid references, optional nulls and unrelated updates still work.
  await db.Alumni.updateOne({ _id: alumni._id }, { $set: { programId: program._id } }).exec();
  await db.Alumni.updateOne({ _id: alumni._id }, { $set: { assignedFacultyId: null } }).exec();
  await db.Alumni.updateOne({ _id: alumni._id }, { $set: { firstName: alumni.firstName } }).exec();

  // 3. Inside a transaction, a reference to a parent created earlier in it is accepted, and a
  //    failed reference rolls the whole transaction back.
  await db.transaction(async (tx) => {
    const created = await tx.Program.create({
      code: "REFTX",
      name: "Reference transaction",
      departmentId: program.departmentId,
    });
    await tx.Alumni.create({
      studentNumber: "REF-TX",
      firstName: "In",
      lastName: "Transaction",
      programId: created._id,
    });
  });
  assert.equal(await db.Alumni.countDocuments({ studentNumber: "REF-TX" }).exec(), 1);
  await assert.rejects(() =>
    db.transaction(async (tx) => {
      await tx.Program.create({
        code: "REFRB",
        name: "Rolled back",
        departmentId: program.departmentId,
      });
      await tx.RolePermission.create({ roleId: role._id, permissionId: missing() });
    }),
  );
  assert.equal(await db.Program.countDocuments({ code: "REFRB" }).exec(), 0);

  // 4. Writes that bypass Mongoose (native driver, mongorestore) are caught by the scanner.
  const orphanId = new Types.ObjectId();
  await db.connection.db!.collection("Employment").insertOne({
    _id: orphanId,
    alumniId: missing(),
    employer: "Orphan",
    isCurrent: false,
  });
  const broken = await findBrokenReferences(db);
  assert.deepEqual(broken, [
    { reference: "Employment.alumniId -> Alumni", count: 1, sample: [String(orphanId)] },
  ]);
  assert.ok(!JSON.stringify(broken).includes("Orphan"), "findings carry ids, never contents");

  // 5. The nightly tick reports it once, to every Super Admin, and audits it.
  const night = new Date("2026-11-11T20:00:00Z");
  const reported = await runIntegrityTick({ db, now: night });
  assert.equal(reported?.length, 1);
  assert.equal(await runIntegrityTick({ db, now: night }), null, "one run per night");
  assert.ok(await db.AuditLog.exists({ action: "integrity.references" }));
  assert.ok(
    (await db.Notification.countDocuments({ summary: /point at missing records/ }).exec()) >= 1,
  );
  console.log(
    "PASS integrity: missing references rejected on create/insertMany/update/upsert, valid and in-transaction references accepted, failed reference rolls back the transaction, native-driver orphan found by the scanner (ids only), nightly tick reports once and audits.",
  );
} finally {
  await db.connection.dropDatabase().catch(() => undefined);
  await db.disconnect();
  await stopCiReplicaSet();
}
