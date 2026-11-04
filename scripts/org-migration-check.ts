import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createDatabase } from "../packages/db/src/index";
import { migrateDatabase } from "../packages/db/src/migration";
import { seedDatabase } from "../packages/db/src/seed-data";
import { isManagedLocalDatabase } from "./local-env.mjs";

// Round-trips the College/Department restructure on synthetic legacy data in a throwaway database.
if (process.env.NODE_ENV === "production")
  throw new Error("Synthetic local database verification only");
const url = (name: string) => `mongodb://127.0.0.1:27018/${name}?replicaSet=rs0`;
const legacyUrl = url(`collab_org_${randomBytes(8).toString("hex")}`);
const freshUrl = url(`collab_org_fresh_${randomBytes(8).toString("hex")}`);
if (!isManagedLocalDatabase(legacyUrl) || !isManagedLocalDatabase(freshUrl))
  throw new Error("Unsafe synthetic target");

const db = createDatabase({ DATABASE_URL: legacyUrl });
const fresh = createDatabase({ DATABASE_URL: freshUrl });
try {
  await db.ready();
  const native = db.connection.db!;
  const oid = () => new db.College()._id;
  const names = async () =>
    (await native.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name).sort();
  const tech = oid();
  const archived = oid();
  const userId = oid();
  const facultyLinked = oid();
  const facultyOrphan = oid();
  const now = new Date();
  await native.collection("Department").insertMany([
    {
      _id: tech,
      name: "Technologies",
      description: "",
      code: "COT",
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: archived,
      name: "Retired",
      description: "",
      code: "RET",
      deletedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await native
    .collection("Department")
    .createIndex({ code: 1 }, { name: "Department_code_key", unique: true });
  const [bsit, old] = [oid(), oid()];
  await native.collection("Program").insertMany([
    {
      _id: bsit,
      code: "BSIT",
      name: "IT",
      description: "",
      departmentId: tech,
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: old,
      code: "OLD",
      name: "Old",
      description: "",
      departmentId: archived,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await native.collection("User").insertOne({
    _id: userId,
    name: "Legacy Faculty",
    email: "legacy.faculty@example.test",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await native.collection("Faculty").insertMany([
    {
      _id: facultyLinked,
      employeeNumber: "E1",
      firstName: "Legacy",
      lastName: "Linked",
      email: "Legacy.Faculty@example.test",
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: facultyOrphan,
      employeeNumber: "E2",
      firstName: "Legacy",
      lastName: "Orphan",
      email: null,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await native.collection("FacultyDepartment").insertMany([
    { facultyId: facultyLinked, departmentId: tech, createdAt: now },
    { facultyId: facultyOrphan, departmentId: tech, createdAt: now },
    { facultyId: facultyOrphan, departmentId: archived, createdAt: now },
  ]);
  const alumniId = oid();
  await native.collection("Alumni").insertOne({
    _id: alumniId,
    studentNumber: "L-1",
    firstName: "Legacy",
    lastName: "Graduate",
    programId: bsit,
    mobileNumber: "0917 123 4567",
    personalEmail: "Legacy.Grad@Example.test",
    facebookAccount: "Legacy Graduate (not a link)",
    employmentStatus: "unknown",
    isTracked: false,
    createdAt: now,
    updatedAt: now,
  });
  const before = await names();

  const preview = await migrateDatabase(db, "dry-run");
  assert.deepEqual(preview.conflicts, []);
  assert.equal(preview.orgStructure?.state, "pending");
  assert.equal(preview.orgStructure?.colleges, 2);
  assert.equal(preview.orgStructure?.facultyLinked, 1);
  assert.equal(preview.orgStructure?.facultyNeedsReview, 1);
  assert.equal(preview.orgStructure?.contactsImported, 2);
  assert.equal(preview.orgStructure?.contactsSkipped, 1);
  assert.deepEqual(await names(), before, "dry-run must not write");

  const applied = await migrateDatabase(db, "apply");
  assert.deepEqual(applied.conflicts, []);
  assert.equal(applied.orgStructure?.state, "complete");
  assert.equal(applied.departmentCodeIndex?.state, "retire");
  const colleges = await db.College.find().sort({ name: 1 }).lean();
  assert.deepEqual(
    colleges.map((c) => String(c._id)).sort(),
    [String(tech), String(archived)].sort(),
  );
  const departments = await db.Department.find().lean();
  assert.equal(departments.length, 2);
  const placeholder = departments.find((d) => String(d.collegeId) === String(tech))!;
  assert.match(placeholder.name, /Technologies – Unsorted/);
  assert.ok(departments.find((d) => String(d.collegeId) === String(archived))!.deletedAt);
  assert.equal(
    String((await db.Program.findById(bsit).lean())!.departmentId),
    String(placeholder._id),
  );
  const linked = (await db.Faculty.findById(facultyLinked).lean())!;
  assert.equal(String(linked.userId), String(userId));
  assert.equal(String(linked.departmentId), String(placeholder._id));
  assert.equal(linked.active, true);
  const orphan = (await db.Faculty.findById(facultyOrphan).lean())!;
  assert.equal(orphan.active, false);
  assert.equal(orphan.departmentId, null);
  const contacts = await db.AlumniContact.find({ alumniId }).sort({ type: 1 }).lean();
  assert.deepEqual(
    contacts.map(({ type, value, isPrimary }) => ({ type, value, isPrimary })),
    [
      { type: "email", value: "legacy.grad@example.test", isPrimary: true },
      { type: "phone", value: "+639171234567", isPrimary: true },
    ],
  );
  await assert.rejects(
    db.AlumniContact.collection.insertOne({
      alumniId,
      type: "phone",
      value: "+639170000000",
      isPrimary: true,
    }),
    /duplicate key/,
    "only one primary contact per type",
  );

  const again = await migrateDatabase(db, "apply");
  assert.deepEqual(again.conflicts, []);
  assert.equal(await db.Department.countDocuments(), 2, "re-apply is idempotent");
  assert.equal(await db.AlumniContact.countDocuments(), 2);

  const extra = await db.Department.create({ collegeId: tech, name: "Information Technology" });
  const refused = await migrateDatabase(db, "rollback");
  assert.equal(refused.orgStructure?.state, "conflict");
  assert.ok(await db.College.exists({ _id: tech }), "refused rollback changes nothing");
  await db.Department.deleteOne({ _id: extra._id });

  const rolledBack = await migrateDatabase(db, "rollback");
  assert.deepEqual(rolledBack.conflicts, []);
  assert.equal(rolledBack.orgStructure?.state, "rolled-back");
  assert.equal(rolledBack.departmentCodeIndex?.state, "restore");
  const legacy = await native.collection("Department").find().toArray();
  assert.deepEqual(
    legacy.map((d) => String(d._id)).sort(),
    [String(tech), String(archived)].sort(),
  );
  assert.equal(
    legacy.some((d) => "collegeId" in d),
    false,
  );
  assert.equal((await names()).includes("College"), false);
  assert.equal(
    String((await native.collection("Program").findOne({ _id: bsit }))!.departmentId),
    String(tech),
  );
  const restoredFaculty = (await native.collection("Faculty").findOne({ _id: facultyLinked }))!;
  assert.equal("roleLevel" in restoredFaculty || "userId" in restoredFaculty, false);
  assert.equal(await native.collection("AlumniContact").countDocuments(), 0);
  assert.equal(await native.collection("MigrationState").countDocuments(), 0);

  const reapplied = await migrateDatabase(db, "apply");
  assert.deepEqual(reapplied.conflicts, []);
  assert.equal(reapplied.orgStructure?.state, "complete");
  assert.equal(await db.Department.countDocuments(), 2);

  await fresh.ready();
  const freshReport = await migrateDatabase(fresh, "apply");
  assert.deepEqual(freshReport.conflicts, []);
  assert.ok(freshReport.createdCollections.includes("College"));
  assert.ok(freshReport.createdCollections.includes("Department"));
  assert.equal((await migrateDatabase(fresh, "dry-run")).orgStructure?.state, "fresh");

  const retained = { ...process.env };
  try {
    process.env.SEED_ADMIN_EMAIL = "synthetic-admin@example.test";
    process.env.SEED_ADMIN_PASSWORD = randomBytes(24).toString("base64url");
    process.env.SEED_DEMO_DATA = "true";
    await seedDatabase(fresh);
    await seedDatabase(fresh);
  } finally {
    for (const key of ["SEED_ADMIN_EMAIL", "SEED_ADMIN_PASSWORD", "SEED_DEMO_DATA"]) {
      if (retained[key] === undefined) delete process.env[key];
      else process.env[key] = retained[key];
    }
  }
  assert.equal(await fresh.College.countDocuments(), 2, "seed is idempotent");
  assert.equal(await fresh.Department.countDocuments(), 3);
  assert.equal(await fresh.Program.countDocuments(), 3);
  assert.equal(await fresh.Alumni.countDocuments(), 4);
  const seededFaculty = await fresh.Faculty.find().lean();
  assert.deepEqual(seededFaculty.map((f) => f.roleLevel).sort(), [
    "college",
    "department",
    "faculty",
    "faculty",
  ]);
  const facultyRole = await fresh.Role.findOne({ key: "faculty" }).orFail().lean();
  assert.equal(await fresh.UserRole.countDocuments({ roleId: facultyRole._id }), 4);
  assert.equal(await fresh.Alumni.countDocuments({ assignedFacultyId: { $type: "objectId" } }), 2);
  const viewerRole = await fresh.Role.findOne({ key: "viewer" }).orFail().lean();
  assert.equal(
    await fresh.UserRole.countDocuments({ roleId: viewerRole._id }),
    4,
    "alumni demo logins",
  );
  assert.equal(
    await fresh.User.countDocuments({ alumniId: { $type: "objectId" } }),
    4,
    "each linked",
  );
  const staffRole = await fresh.Role.findOne({ key: "staff" }).orFail().lean();
  const staffUser = await fresh.User.findOne({ email: "staff@collab.test" }).orFail().lean();
  assert.ok(await fresh.UserRole.exists({ userId: staffUser._id, roleId: staffRole._id }));
  const seededPrograms = await fresh.Program.find().lean();
  const seededDepartments = new Set(seededPrograms.map((p) => String(p.departmentId)));
  assert.equal(seededDepartments.size, 3, "alumni span more than one department");
  console.log(
    "PASS org-structure migration: dry-run, apply, idempotent re-apply, guarded rollback, round trip, fresh install, idempotent demo seed.",
  );
} finally {
  await db.connection.dropDatabase().catch(() => undefined);
  await fresh.connection.dropDatabase().catch(() => undefined);
  await db.disconnect();
  await fresh.disconnect();
}
