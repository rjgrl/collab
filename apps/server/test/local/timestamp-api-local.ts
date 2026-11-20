import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { createDatabase } from "@Alumni-Tracking-Ss/db";
import { migrateDatabase } from "@Alumni-Tracking-Ss/db/migration";
import { seedDatabase } from "@Alumni-Tracking-Ss/db/seed-data";
import { createSession } from "@Alumni-Tracking-Ss/api/services/session";
import { createApp } from "../../src/app";
import { adminCookie } from "./local-admin";

if (process.env.NODE_ENV === "production") throw new Error("Synthetic local acceptance only.");
process.env.NODE_ENV = "test";
process.env.PASSWORD_BREACH_CHECK = "local";
const name = `collab_timestamp_api_${randomBytes(8).toString("hex")}`;
process.env.DATABASE_URL = `mongodb://127.0.0.1:27018/${name}?replicaSet=rs0`;
process.env.SEED_ADMIN_EMAIL = "synthetic-admin@buksu.edu.ph";
process.env.SEED_ADMIN_PASSWORD = randomBytes(24).toString("base64url");
process.env.SEED_DEMO_DATA = "true";
delete process.env.STAFF_EMAIL_DOMAINS;
const db = createDatabase({ DATABASE_URL: process.env.DATABASE_URL });
const origin = "http://localhost:3001";
const header = "X-Timestamp-Edit";
try {
  assert.deepEqual((await migrateDatabase(db, "apply")).conflicts, []);
  await seedDatabase(db);
  const app = createApp({ db, config: { nodeEnv: "test", origin }, integrationEnv: {} });
  const cookies: Record<string, string> = { admin: await adminCookie(db) };
  for (const actor of ["faculty.it", "department.head"]) {
    const user = await db.User.findOne({ email: `${actor}@collab.test` })
      .lean()
      .orFail();
    cookies[actor] = `ats_session=${(await createSession(db, String(user._id), {})).token}`;
  }
  const first = await db.Alumni.findOne({ studentNumber: "2020-0001" }).lean().orFail();
  const foreign = await db.Alumni.findOne({ studentNumber: "2019-0144" }).lean().orFail();
  const id = String(first._id),
    foreignId = String(foreign._id);
  const get = (actor: string, route: string) =>
    request(app).get(`/api/v1${route}`).set("Cookie", cookies[actor]!);
  const begin = (actor: string, alumniIds: string[], purpose = "details") =>
    request(app)
      .post("/api/v1/alumni/timestamp-edits")
      .set("Cookie", cookies[actor]!)
      .set("Origin", origin)
      .send({ alumniIds, purpose });
  const payload = {
    firstName: first.firstName,
    lastName: first.lastName,
    middleName: first.middleName ?? "",
    suffix: first.suffix ?? "",
    studentNumber: first.studentNumber,
    programId: String(first.programId),
    graduationYear: first.graduationYear ?? 2020,
    batch: "Timestamp update",
  };
  const save = (actor: string, token?: string) => {
    const operation = request(app)
      .patch(`/api/v1/alumni/${id}`)
      .set("Cookie", cookies[actor]!)
      .set("Origin", origin);
    if (token) operation.set(header, token);
    return operation.send(payload);
  };
  const beforeOrdinary = await db.AlumniTimestamp.countDocuments();
  assert.equal((await get("faculty.it", `/alumni/${id}`)).status, 200);
  assert.equal(await db.AlumniTimestamp.countDocuments(), beforeOrdinary);
  const a = await begin("faculty.it", [id]);
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(a.body.snapshot[0].id, id);
  assert.ok(a.body.token && a.body.timestamp);
  const readTimestamp = (await db.AlumniTimestamp.findOne({ key: id }).lean().orFail())
    .readTimestamp;
  await get("faculty.it", `/alumni/${id}`);
  assert.equal(
    (await db.AlumniTimestamp.findOne({ key: id }).lean().orFail()).readTimestamp,
    readTimestamp,
  );
  const b = await begin("department.head", [id]);
  assert.equal(b.status, 201, JSON.stringify(b.body));
  const audits = await db.AuditLog.countDocuments();
  assert.equal(
    (await save("faculty.it")).status,
    409,
    "interactive writes cannot omit edit context",
  );
  const stale = await save("faculty.it", a.body.token);
  assert.equal(stale.status, 409, JSON.stringify(stale.body));
  assert.equal(stale.body.code, "TIMESTAMP_CONFLICT");
  assert.equal(await db.AuditLog.countDocuments(), audits);
  assert.equal((await db.Alumni.findById(id).lean().orFail()).batch ?? null, first.batch ?? null);
  const wrongActor = await save("faculty.it", b.body.token);
  assert.equal(wrongActor.status, 409, JSON.stringify(wrongActor.body));
  const valid = await save("department.head", b.body.token);
  assert.equal(valid.status, 200, JSON.stringify(valid.body));
  assert.equal((await db.Alumni.findById(id).lean().orFail()).batch, payload.batch);
  assert.equal((await save("department.head", b.body.token)).status, 409, "replay rejected");
  const states = await db.AlumniTimestamp.countDocuments();
  const outOfScope = await begin("department.head", [foreignId]);
  assert.ok([403, 404].includes(outOfScope.status), JSON.stringify(outOfScope.body));
  assert.equal(await db.AlumniTimestamp.countDocuments(), states);
  const oldAssignment = await begin("faculty.it", [id]);
  assert.equal(oldAssignment.status, 201);
  const assign = await begin("department.head", [id], "assignment");
  assert.equal(assign.status, 201, JSON.stringify(assign.body));
  const moved = await request(app)
    .post("/api/v1/alumni/assign")
    .set("Cookie", cookies["department.head"]!)
    .set("Origin", origin)
    .set(header, assign.body.token)
    .send({ alumniIds: [id], facultyId: null });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  const revoked = await save("faculty.it", oldAssignment.body.token);
  assert.ok(
    [403, 404].includes(revoked.status),
    "save must recheck current assignment before reporting metadata conflicts",
  );
  assert.equal((await db.Alumni.findById(id).lean().orFail()).assignedFacultyId ?? null, null);
  console.log(
    "PASS: ordinary views unchanged; authorized edit snapshots; missing/stale/wrong-owner/replayed contexts rejected; data/audit atomic; head scope and reassignment checked at save.",
  );
} finally {
  if (db.connection.db?.databaseName === name) await db.connection.dropDatabase();
  await db.disconnect();
}
