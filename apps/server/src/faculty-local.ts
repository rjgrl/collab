import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { createDatabase } from "@Alumni-Tracking-Ss/db";
import { migrateDatabase } from "@Alumni-Tracking-Ss/db/migration";
import { seedDatabase } from "@Alumni-Tracking-Ss/db/seed-data";
import { createSession } from "@Alumni-Tracking-Ss/api/services/session";
import { createApp } from "./app";
import { adminCookie } from "./local-admin";

// Faculty management, role limits, assignment and academic delete guards on seeded demo data.
if (process.env.NODE_ENV === "production") throw new Error("Synthetic local acceptance only.");
process.env.NODE_ENV = "test";
process.env.PASSWORD_BREACH_CHECK = "local";
process.env.DATABASE_URL = `mongodb://127.0.0.1:27018/collab_faculty_${randomBytes(8).toString("hex")}?replicaSet=rs0`;
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

  // The retired Staff role is not seeded: its demo login must not exist.
  assert.equal(await db.User.exists({ email: "staff@collab.test" }), null);

  const cookieFor = async (email: string) => {
    const user = await db.User.findOne({ email }).orFail().lean();
    return `ats_session=${(await createSession(db, String(user._id), {})).token}`;
  };
  const cookies: Record<string, string> = {};
  for (const name of ["college.head", "department.head", "faculty.it", "faculty.education"])
    cookies[name] = await cookieFor(`${name}@collab.test`);
  cookies.admin = await adminCookie(db);
  const as = (name: string) => ({
    get: (url: string) => request(app).get(url).set("Cookie", cookies[name]!),
    post: (url: string, body: object) =>
      request(app).post(url).set("Cookie", cookies[name]!).set("Origin", origin).send(body),
    patch: (url: string, body: object) =>
      request(app).patch(url).set("Cookie", cookies[name]!).set("Origin", origin).send(body),
    delete: (url: string) =>
      request(app).delete(url).set("Cookie", cookies[name]!).set("Origin", origin),
  });

  const dept = async (name: string) =>
    String((await db.Department.findOne({ name }).orFail().lean())._id);
  const it = await dept("Information Technology");
  const auto = await dept("Automotive Technology");
  const secEd = await dept("Secondary Education");
  const facultyId = async (email: string) =>
    String((await db.Faculty.findOne({ email }).orFail().lean())._id);
  const fIt = await facultyId("faculty.it@collab.test");
  const fEdu = await facultyId("faculty.education@collab.test");
  const fCollege = await facultyId("college.head@collab.test");
  const alumniId = async (studentNumber: string) =>
    String((await db.Alumni.findOne({ studentNumber }).orFail().lean())._id);
  const [g1, g2, g3, g4] = await Promise.all(
    ["2020-0001", "2020-0002", "2019-0144", "2021-0210"].map(alumniId),
  );

  // Session exposes the faculty record that drives menus.
  const me = await as("department.head").get("/api/auth/me");
  assert.equal(me.body.faculty.roleLevel, "department");

  // Listing follows scope; faculty-level users cannot list.
  const names = async (who: string) =>
    ((await as(who).get("/api/faculty?pageSize=100")).body as { email: string }[])
      .map((f) => f.email)
      .sort();
  assert.deepEqual(await names("college.head"), [
    "college.head@collab.test",
    "department.head@collab.test",
    "faculty.it@collab.test",
  ]);
  assert.deepEqual(await names("department.head"), [
    "college.head@collab.test",
    "department.head@collab.test",
    "faculty.it@collab.test",
  ]);
  assert.equal((await names("admin")).length, 4);
  assert.equal((await as("faculty.it").get("/api/faculty")).status, 403);

  // Creating: only levels strictly below your own, only inside your departments.
  const draft = (
    email: string,
    departmentId: string,
    roleLevel: string,
    employeeNumber: string,
  ) => ({
    firstName: "New",
    lastName: "Member",
    email,
    employeeNumber,
    departmentId,
    roleLevel,
  });
  assert.equal(
    (
      await as("department.head").post(
        "/api/faculty",
        draft("n1@collab.test", it, "faculty", "N-1"),
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await as("department.head").post(
        "/api/faculty",
        draft("n2@collab.test", it, "department", "N-2"),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await as("department.head").post(
        "/api/faculty",
        draft("n3@collab.test", auto, "faculty", "N-3"),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await as("college.head").post(
        "/api/faculty",
        draft("n4@collab.test", auto, "department", "N-4"),
      )
    ).status,
    201,
  );
  assert.equal(
    (await as("college.head").post("/api/faculty", draft("n5@collab.test", it, "college", "N-5")))
      .status,
    403,
  );
  assert.equal(
    (
      await as("college.head").post(
        "/api/faculty",
        draft("n6@collab.test", secEd, "faculty", "N-6"),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await as("faculty.education").post(
        "/api/faculty",
        draft("n7@collab.test", it, "faculty", "N-7"),
      )
    ).status,
    403,
  );
  assert.equal(
    (await as("faculty.it").post("/api/faculty", draft("n8@collab.test", it, "faculty", "N-8")))
      .status,
    403,
  );
  assert.equal(
    (
      await as("department.head").post(
        "/api/faculty",
        draft("n1@collab.test", it, "faculty", "N-9"),
      )
    ).status,
    409,
  );
  process.env.STAFF_EMAIL_DOMAINS = "buksu.edu.ph,collab.test";
  try {
    assert.equal(
      (
        await as("department.head").post(
          "/api/faculty",
          draft("n10@buksu.edu.ph.evil.com", it, "faculty", "N-10"),
        )
      ).status,
      403,
    );
  } finally {
    delete process.env.STAFF_EMAIL_DOMAINS;
  }
  const created = await db.Faculty.findOne({ email: "n1@collab.test" }).orFail().lean();
  assert.equal(created.roleLevel, "faculty");
  assert.ok(await db.UserRole.exists({ userId: created.userId }));

  // Editing: heads cannot touch peers or seniors, nor out-of-scope records (404, no probing).
  assert.equal(
    (await as("department.head").patch(`/api/faculty/${fCollege}`, { lastName: "X" })).status,
    404,
  );
  assert.equal(
    (await as("department.head").patch(`/api/faculty/${fEdu}`, { lastName: "X" })).status,
    404,
  );
  assert.equal(
    (await as("department.head").patch(`/api/faculty/${fIt}`, { roleLevel: "department" })).status,
    403,
  );
  assert.equal(
    (await as("department.head").patch(`/api/faculty/${fIt}`, { employeeNumber: "IT-77" })).status,
    200,
  );

  // Assignment: within scope only; one bad id rejects the batch.
  assert.equal(
    (await as("department.head").post("/api/alumni/assign", { alumniIds: [g2], facultyId: fIt }))
      .status,
    200,
  );
  const mine = await as("faculty.it").get("/api/alumni?assignment=mine");
  assert.deepEqual(
    (mine.body as { id: string }[]).map((a) => a.id).sort(),
    [g1, g2].sort(),
    "appears immediately",
  );
  assert.equal(
    (await as("department.head").post("/api/alumni/assign", { alumniIds: [g4], facultyId: fIt }))
      .status,
    404,
  );
  assert.equal(
    (await as("department.head").post("/api/alumni/assign", { alumniIds: [g1], facultyId: fEdu }))
      .status,
    404,
  );
  assert.equal(
    (
      await as("department.head").post("/api/alumni/assign", {
        alumniIds: [g1, g3],
        facultyId: fIt,
      })
    ).status,
    404,
  );
  assert.equal(
    String((await db.Alumni.findById(g1).lean())!.assignedFacultyId),
    fIt,
    "rejected batch changes nothing",
  );
  assert.equal(
    (await as("faculty.it").post("/api/alumni/assign", { alumniIds: [g1], facultyId: fIt })).status,
    403,
  );
  assert.equal(
    (await as("college.head").post("/api/alumni/assign", { alumniIds: [g4], facultyId: fIt }))
      .status,
    200,
  );
  const newFaculty = String(created._id);
  const bulk = await as("college.head").post("/api/alumni/assign", {
    alumniIds: [g1, g2],
    facultyId: newFaculty,
  });
  assert.deepEqual(bulk.body, { updated: 2 });
  assert.equal(
    (await as("admin").post("/api/alumni/assign", { alumniIds: [g3], facultyId: null })).status,
    200,
  );
  assert.equal((await db.Alumni.findById(g3).lean())!.assignedFacultyId, null);
  for (const action of ["alumni.assign", "alumni.reassign", "alumni.unassign"])
    assert.ok(await db.AuditLog.exists({ action }), `${action} audited`);

  // Deactivation unassigns, flags for reassignment, and ends the member's sessions.
  const itCookie = cookies["faculty.it"]!;
  assert.equal(
    (await as("department.head").patch(`/api/faculty/${fIt}`, { active: false })).status,
    200,
  );
  const g4Row = (await db.Alumni.findById(g4).lean())!;
  assert.equal(g4Row.assignedFacultyId, null);
  assert.equal(g4Row.needsReassignment, true);
  const flagged = await as("college.head").get("/api/alumni?assignment=needs_reassignment");
  assert.deepEqual(
    (flagged.body as { id: string }[]).map((a) => a.id),
    [g4],
  );
  assert.equal((await request(app).get("/api/alumni").set("Cookie", itCookie)).status, 401);
  assert.ok(await db.AuditLog.exists({ action: "faculty.deactivate" }));

  // Role changes are audited; promotion takes the member out of the department head's reach.
  const n1 = String(created._id);
  assert.equal(
    (await as("college.head").patch(`/api/faculty/${n1}`, { roleLevel: "department" })).status,
    200,
  );
  assert.ok(await db.AuditLog.exists({ action: "faculty.role", entityId: n1 }));
  assert.equal(
    (await as("department.head").patch(`/api/faculty/${n1}`, { lastName: "Y" })).status,
    404,
  );

  // Academic delete guards name what blocks them.
  const blocked = await as("admin").delete(`/api/departments/${it}`);
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.error, /program/);
  const cot = String(
    (await db.College.findOne({ name: "College of Technologies" }).orFail().lean())._id,
  );
  assert.equal((await as("admin").delete(`/api/colleges/${cot}`)).status, 409);
  const bsit = String((await db.Program.findOne({ code: "BSIT" }).orFail().lean())._id);
  assert.equal((await as("admin").delete(`/api/programs/${bsit}`)).status, 409);
  const fresh = await as("admin").post("/api/colleges", { name: "College of Testing" });
  assert.equal(fresh.status, 201);
  assert.equal((await as("admin").delete(`/api/colleges/${fresh.body.id}`)).status, 200);
  console.log(
    "PASS faculty: scoped listing, create/edit level and department limits, email allowlist, scoped single and bulk assignment, immediate My Assigned, deactivation release, audited role change, delete guards.",
  );
} finally {
  await db.connection.dropDatabase().catch(() => undefined);
  await db.disconnect();
}
