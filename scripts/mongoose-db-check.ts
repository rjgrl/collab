import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createDatabase, toEntity, withNotDeleted } from "../packages/db/src/index";
import { migrateDatabase } from "../packages/db/src/migration";
import { seedDatabase } from "../packages/db/src/seed-data";
import { verifyTransactionSupport } from "../packages/db/src/transactions";
import { isManagedLocalDatabase } from "./local-env.mjs";

if (process.env.NODE_ENV === "production")
  throw new Error("Synthetic local database verification only");
const name = `collab_mongoose_${randomBytes(8).toString("hex")}`;
const url = `mongodb://127.0.0.1:27018/${name}?replicaSet=rs0`;
if (!isManagedLocalDatabase(url)) throw new Error("Unsafe synthetic target");
const db = createDatabase({ DATABASE_URL: url });
const peer = createDatabase({ DATABASE_URL: url });
try {
  const initial = await migrateDatabase(db);
  assert.equal(initial.collections.length, 0, "Opening models must not create collections");
  assert.equal(initial.createdIndexes.length, 0, "Dry-run must not create indexes");
  assert.equal(initial.conflicts.length, 0);
  const applied = await migrateDatabase(db, "apply");
  assert.equal(applied.createdCollections.length, 23);
  assert.equal(applied.createdIndexes.length, 38);
  const retainedEnv = {
    SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD,
    SEED_DEMO_DATA: process.env.SEED_DEMO_DATA,
  };
  try {
    process.env.SEED_ADMIN_EMAIL = "synthetic-admin@example.test";
    process.env.SEED_ADMIN_PASSWORD = randomBytes(24).toString("base64url");
    process.env.SEED_DEMO_DATA = "false";
    await seedDatabase(db);
  } finally {
    for (const [key, value] of Object.entries(retainedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  assert.equal(await db.User.countDocuments(), 1);
  assert.equal(await db.Role.countDocuments(), 3);
  assert.equal(await db.Permission.countDocuments(), 26);
  await verifyTransactionSupport(db);
  const department = await db.Department.create({ name: "Synthetic" });
  const program = await db.Program.create({
    departmentId: department._id,
    code: "SYNTHETIC",
    name: "Synthetic",
  });
  const absent = await db.Alumni.create({
    studentNumber: "ABSENT",
    firstName: "Single",
    lastName: "Legacy",
    programId: program._id,
  });
  await db.Alumni.create({
    studentNumber: "NULL",
    firstName: "Explicit",
    lastName: "Null",
    programId: program._id,
    deletedAt: null,
  });
  await db.Alumni.create({
    studentNumber: "ARCHIVED",
    firstName: "Archived",
    lastName: "Record",
    programId: program._id,
    deletedAt: new Date(),
  });
  assert.equal(
    await db.Alumni.countDocuments(withNotDeleted()),
    2,
    "Absent/null soft deletion semantics must agree",
  );
  assert.equal(
    Object.hasOwn(await db.Alumni.findById(absent._id).lean().orFail(), "suffix"),
    false,
  );
  const one = await db.User.create({ name: "One unsplit display name", email: "one@example.test" });
  const two = await db.User.create({
    name: "Another unsplit display name",
    email: "two@example.test",
    alumniId: null,
  });
  await db.User.create({ name: "Another null link", email: "three@example.test", alumniId: null });
  await db.User.updateOne({ _id: one._id }, { $set: { alumniId: absent._id } });
  await assert.rejects(
    () => peer.User.updateOne({ _id: two._id }, { $set: { alumniId: absent._id } }).exec(),
    /E11000|duplicate key/i,
  );
  const legacy = toEntity(await db.User.findById(one._id).lean().orFail());
  assert.equal(legacy.name, "One unsplit display name");
  assert.equal(Object.hasOwn(legacy, "firstName"), false);
  assert.equal(legacy.alumniId, absent._id.toHexString());
  const before = JSON.stringify(await db.User.find().sort({ _id: 1 }).lean());
  const repeated = await migrateDatabase(db, "apply");
  assert.equal(repeated.createdCollections.length, 0);
  assert.equal(repeated.createdIndexes.length, 0);
  assert.deepEqual(repeated.conflicts, []);
  assert.equal(JSON.stringify(await db.User.find().sort({ _id: 1 }).lean()), before);
  const rollback = await migrateDatabase(db, "rollback");
  assert.equal(rollback.createdIndexes.length, 0);
  assert.equal(await db.User.countDocuments(), 4);
  console.log(
    "PASS fresh synthetic namespace: read-only startup/dry-run, 23 collections/38 indexes, seed, nested automatic-session rollback, legacy absent/null fields, ObjectId serialization, unique partial links, repeatable migration and non-destructive rollback. Synthetic namespace retained; working database untouched.",
  );
} catch {
  console.error("Synthetic Mongoose database verification failed; private diagnostics withheld.");
  process.exitCode = 1;
} finally {
  await peer.disconnect();
  await db.disconnect();
}
