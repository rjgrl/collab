import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { createDatabase, hashPassword } from "@Alumni-Tracking-Ss/db";
import { migrateDatabase } from "@Alumni-Tracking-Ss/db/migration";
import { seedDatabase } from "@Alumni-Tracking-Ss/db/seed-data";
import { createSession } from "@Alumni-Tracking-Ss/api/services/session";
import { createApp } from "./app";

// Contacts (validation, primary rule, scope), profile editing with account name sync, and the
// field-level change history with its Admin/heads-only, in-scope visibility.
if (process.env.NODE_ENV === "production") throw new Error("Synthetic local acceptance only.");
process.env.NODE_ENV = "test";
process.env.PASSWORD_BREACH_CHECK = "local";
process.env.DATABASE_URL = `mongodb://127.0.0.1:27018/collab_contacts_${randomBytes(8).toString("hex")}?replicaSet=rs0`;
process.env.SEED_ADMIN_EMAIL = "synthetic-admin@example.test";
process.env.SEED_ADMIN_PASSWORD = randomBytes(24).toString("base64url");
process.env.SEED_DEMO_DATA = "true";
delete process.env.STAFF_EMAIL_DOMAINS;

const db = createDatabase({ DATABASE_URL: process.env.DATABASE_URL });
const origin = "http://localhost:3001";
try {
  assert.deepEqual((await migrateDatabase(db, "apply")).conflicts, []);
  await seedDatabase(db);
  const app = createApp({ db, config: { nodeEnv: "test", origin }, integrationEnv: {} });

  const staffRole = await db.Role.findOne({ key: "staff" }).orFail().lean();
  const staff = await db.User.create({
    name: "Synthetic Staff",
    email: "staff@collab.test",
    emailVerified: true,
    status: "active",
    passwordHash: await hashPassword(randomBytes(24).toString("base64url")),
  });
  await db.UserRole.create({ userId: staff._id, roleId: staffRole._id });
  const cookies: Record<string, string> = {};
  for (const name of ["college.head", "department.head", "faculty.it", "staff"]) {
    const user = await db.User.findOne({ email: `${name}@collab.test` })
      .orFail()
      .lean();
    cookies[name] = `ats_session=${(await createSession(db, String(user._id), {})).token}`;
  }
  const as = (name: string) => ({
    get: (url: string) => request(app).get(url).set("Cookie", cookies[name]!),
    post: (url: string, body: object) =>
      request(app).post(url).set("Cookie", cookies[name]!).set("Origin", origin).send(body),
    patch: (url: string, body: object) =>
      request(app).patch(url).set("Cookie", cookies[name]!).set("Origin", origin).send(body),
    delete: (url: string) =>
      request(app).delete(url).set("Cookie", cookies[name]!).set("Origin", origin),
  });
  const alumni = async (studentNumber: string) =>
    (await db.Alumni.findOne({ studentNumber }).orFail().lean())._id.toString();
  const g1 = await alumni("2020-0001"); // IT, assigned to faculty.it
  const g2 = await alumni("2020-0002"); // IT, unassigned
  const g3 = await alumni("2019-0144"); // Education
  const tracker = as("faculty.it");

  // Validation per type.
  const add = (id: string, body: object) => tracker.post(`/api/alumni/${id}/contacts`, body);
  const phone = await add(g1, { type: "phone", value: "0917 123 4567", label: "Mobile" });
  assert.equal(phone.status, 201);
  assert.equal(phone.body.value, "+639171234567", "normalized to E.164");
  assert.equal(phone.body.isPrimary, true, "first contact of a type becomes primary");
  for (const [body, why] of [
    [{ type: "phone", value: "12345" }, "short phone"],
    [{ type: "email", value: "not-an-email" }, "bad email"],
    [{ type: "instagram", value: "https://facebook.com/someone" }, "wrong platform"],
    [{ type: "facebook", value: "https://facebook.com.evil.test/x" }, "lookalike domain"],
    [{ type: "other_social", value: "javascript:alert(1)" }, "script URL"],
    [{ type: "fax", value: "1" }, "unknown type"],
  ] as const)
    assert.equal((await add(g1, body)).status, 400, why);
  assert.equal(
    (await add(g1, { type: "phone", value: "+63 917 123 4567" })).status,
    409,
    "duplicate",
  );

  // Exactly one primary per type, enforced on add and on "make primary".
  const second = await add(g1, { type: "phone", value: "0918 765 4321", isPrimary: true });
  assert.equal(second.status, 201);
  const primaries = async () =>
    (await db.AlumniContact.find({ alumniId: g1, type: "phone", isPrimary: true }).lean()).map(
      (c) => String(c._id),
    );
  assert.deepEqual(await primaries(), [second.body.id]);
  assert.equal(
    (await tracker.patch(`/api/alumni/${g1}/contacts/${phone.body.id}`, { isPrimary: true }))
      .status,
    200,
  );
  assert.deepEqual(await primaries(), [phone.body.id]);
  assert.equal(
    (await tracker.patch(`/api/alumni/${g1}/contacts/${phone.body.id}`, { value: "nope" })).status,
    400,
    "edits are re-validated against the stored type",
  );
  const social = await add(g1, {
    type: "linkedin",
    value: "https://www.linkedin.com/in/synthetic",
  });
  assert.equal(social.status, 201);
  assert.equal((await tracker.delete(`/api/alumni/${g1}/contacts/${second.body.id}`)).status, 200);

  // Scope: out-of-scope alumni, and contact ids addressed through the wrong alumnus.
  assert.equal((await add(g3, { type: "email", value: "x@example.test" })).status, 404);
  assert.equal(
    (await add(g2, { type: "email", value: "x@example.test" })).status,
    404,
    "unassigned",
  );
  const g3Contact = await as("staff").post(`/api/alumni/${g3}/contacts`, {
    type: "email",
    value: "g3@example.test",
  });
  assert.equal(g3Contact.status, 201);
  assert.equal(
    (await tracker.patch(`/api/alumni/${g1}/contacts/${g3Contact.body.id}`, { label: "x" })).status,
    404,
  );
  const detail = await tracker.get(`/api/alumni/${g1}`);
  assert.deepEqual((detail.body.contacts as { type: string }[]).map((c) => c.type).sort(), [
    "linkedin",
    "phone",
  ]);
  const list = await as("department.head").get("/api/alumni?pageSize=100");
  const listed = (list.body as { id: string; contacts: { isPrimary: boolean }[] }[]).find(
    (a) => a.id === g1,
  )!;
  assert.ok(
    listed.contacts.length && listed.contacts.every((c) => c.isPrimary),
    "list shows primaries",
  );

  // Profile editing: unregistered profile changes directly; a registered one syncs the account.
  const profile = (id: string, studentNumber: string, extra: object) =>
    as("department.head").patch(`/api/alumni/${id}`, {
      studentNumber,
      programId: detail.body.programId as string,
      graduationYear: 2024,
      ...extra,
    });
  assert.equal(
    (await profile(g1, "2020-0001", { firstName: "Renamed", batch: "2024-A" })).status,
    200,
  );
  const g1Row = (await db.Alumni.findById(g1).lean())!;
  assert.equal(g1Row.firstName, "Renamed");
  assert.equal(g1Row.batch, "2024-A");
  assert.equal(g1Row.lastName, "Graduate One", "omitted fields are unchanged");
  const viewerRole = await db.Role.findOne({ key: "viewer" }).orFail().lean();
  const owner = await db.User.create({
    name: "Synthetic Graduate Two",
    firstName: "Synthetic",
    lastName: "Graduate Two",
    email: "graduate.two@collab.test",
    emailVerified: true,
    status: "active",
    alumniId: g2,
  });
  await db.UserRole.create({ userId: owner._id, roleId: viewerRole._id });
  assert.equal((await profile(g2, "2020-0002", { lastName: "Graduate Second" })).status, 200);
  assert.equal((await db.User.findById(owner._id).lean())!.lastName, "Graduate Second");
  assert.equal((await db.Alumni.findById(g2).lean())!.lastName, "Graduate Second");

  // History: field-level entries, Admin/heads only, within scope.
  const history = await as("department.head").get(`/api/alumni/${g1}/history`);
  assert.equal(history.status, 200);
  const entries = history.body as {
    action: string;
    actor: { email: string } | null;
    changes: { field: string; old: unknown; new: unknown }[];
  }[];
  const rename = entries.find((e) => e.action === "alumni.update")!;
  assert.deepEqual(
    rename.changes.find((c) => c.field === "firstName"),
    { field: "firstName", old: "Synthetic", new: "Renamed" },
  );
  assert.equal(rename.actor?.email, "department.head@collab.test");
  assert.ok(
    entries.some(
      (e) =>
        e.action === "contacts.create" &&
        e.changes.some((c) => c.field === "value" && c.old === null && c.new === "+639171234567"),
    ),
  );
  const removed = entries.find((e) => e.action === "contacts.delete")!;
  assert.ok(
    removed.changes.some((c) => c.field === "value" && c.old === "+639187654321" && c.new === null),
  );
  assert.ok(entries.some((e) => e.action === "contacts.update"));
  assert.equal((await tracker.get(`/api/alumni/${g1}/history`)).status, 403, "faculty-level");
  assert.equal((await as("staff").get(`/api/alumni/${g1}/history`)).status, 403, "staff");
  assert.equal(
    (await as("college.head").get(`/api/alumni/${g3}/history`)).status,
    404,
    "out of scope",
  );
  assert.equal((await as("college.head").get(`/api/alumni/${g1}/history`)).status, 200);
  console.log(
    "PASS contacts: per-type validation and E.164, duplicate guard, single primary, scoped access, profile edit with account sync, field-level history for Admin/heads in scope.",
  );
} finally {
  await db.connection.dropDatabase().catch(() => undefined);
  await db.disconnect();
}
