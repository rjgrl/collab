import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { createDatabase, hashPassword } from "@Alumni-Tracking-Ss/db";
import { migrateDatabase } from "@Alumni-Tracking-Ss/db/migration";
import { seedDatabase } from "@Alumni-Tracking-Ss/db/seed-data";
import { createSession, loadAuthUser } from "@Alumni-Tracking-Ss/api/services/session";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { createApp } from "./app";
import { alumniService } from "./modules/alumni/service";
import { reportsService } from "./modules/reports/service";

// Authorization matrix for record-level scope: every role x action against seeded demo data
// spanning two colleges and three departments. Real MongoDB, real HTTP stack.
if (process.env.NODE_ENV === "production") throw new Error("Synthetic local acceptance only.");
process.env.NODE_ENV = "test";
process.env.PASSWORD_BREACH_CHECK = "local";
process.env.DATABASE_URL = `mongodb://127.0.0.1:27018/collab_scope_${randomBytes(8).toString("hex")}?replicaSet=rs0`;
process.env.SEED_ADMIN_EMAIL = "synthetic-admin@example.test";
process.env.SEED_ADMIN_PASSWORD = randomBytes(24).toString("base64url");
process.env.SEED_DEMO_DATA = "true";
delete process.env.STAFF_EMAIL_DOMAINS;

const db = createDatabase({ DATABASE_URL: process.env.DATABASE_URL });
const origin = "http://localhost:3001";
const uploadDir = path.resolve(".tools/scope-uploads", randomBytes(8).toString("hex"));
try {
  assert.deepEqual((await migrateDatabase(db, "apply")).conflicts, []);
  await seedDatabase(db);
  const app = createApp({ db, config: { nodeEnv: "test", origin }, integrationEnv: { uploadDir } });

  const rows = await db.Alumni.find().lean();
  type Row = (typeof rows)[number];
  const alumni = Object.fromEntries(
    rows.map((a) => [a.lastName.replace("Graduate ", "G"), a]),
  ) as Record<"GOne" | "GTwo" | "GThree" | "GFour", Row>;
  const id = (key: keyof typeof alumni) => String(alumni[key]._id);
  const bsed = String(alumni.GThree.programId);

  // Extra accounts: Staff without a faculty record (unscoped) and a deactivated faculty member.
  // staff@collab.test comes from the demo seed.
  const facultyRole = await db.Role.findOne({ key: "faculty" }).orFail().lean();
  const passwordHash = await hashPassword(randomBytes(24).toString("base64url"));
  const inactive = await db.User.create({
    name: "Inactive Faculty",
    email: "inactive@collab.test",
    emailVerified: true,
    status: "active",
    passwordHash,
  });
  await db.UserRole.create({ userId: inactive._id, roleId: facultyRole._id });
  const itDepartment = (
    await db.Faculty.findOne({ email: "faculty.it@collab.test" }).orFail().lean()
  ).departmentId;
  await db.Faculty.create({
    userId: inactive._id,
    employeeNumber: "DEMO-9999",
    firstName: "Inactive",
    lastName: "Faculty",
    departmentId: itDepartment,
    roleLevel: "college",
    active: false,
  });

  // A private evidence file on the Education alumnus, stored locally so download can succeed.
  await mkdir(uploadDir, { recursive: true });
  const storageKey = randomBytes(16).toString("hex");
  await writeFile(path.join(uploadDir, storageKey), Buffer.from("%PDF-1.4 synthetic"));
  const evidence = await db.EvidenceFile.create({
    alumniId: alumni.GThree._id,
    originalName: "evidence.pdf",
    mimeType: "application/pdf",
    sizeBytes: 18,
    provider: "local",
    storageKey,
  });

  const tokens = new Map<string, string>();
  for (const email of [
    "college.head@collab.test",
    "department.head@collab.test",
    "faculty.it@collab.test",
    "faculty.education@collab.test",
    "staff@collab.test",
    "inactive@collab.test",
  ]) {
    const user = await db.User.findOne({ email }).orFail().lean();
    tokens.set(email, (await createSession(db, String(user._id), {})).token);
  }
  const as = (email: string) => {
    const cookie = `ats_session=${tokens.get(email)!}`;
    return {
      get: (url: string) => request(app).get(url).set("Cookie", cookie),
      patch: (url: string, body: object) =>
        request(app).patch(url).set("Cookie", cookie).set("Origin", origin).send(body),
      post: (url: string, body: object) =>
        request(app).post(url).set("Cookie", cookie).set("Origin", origin).send(body),
    };
  };

  const visible: Record<string, (keyof typeof alumni)[]> = {
    "college.head@collab.test": ["GOne", "GTwo", "GFour"],
    "department.head@collab.test": ["GOne", "GTwo"],
    "faculty.it@collab.test": ["GOne"],
    "faculty.education@collab.test": ["GThree"],
    "staff@collab.test": ["GOne", "GTwo", "GThree", "GFour"],
    "inactive@collab.test": [],
  };
  const all = ["GOne", "GTwo", "GThree", "GFour"] as const;
  for (const [email, allowed] of Object.entries(visible)) {
    const user = as(email);
    const list = await user.get("/api/alumni?pageSize=100");
    assert.equal(list.status, 200, `${email} list: ${JSON.stringify(list.body)}`);
    assert.deepEqual(
      (list.body as { id: string }[]).map((row) => row.id).sort(),
      allowed.map(id).sort(),
      `${email} list contents`,
    );
    for (const key of all) {
      const inScope = allowed.includes(key);
      const expected = inScope ? 200 : 404;
      assert.equal(
        (await user.get(`/api/alumni/${id(key)}`)).status,
        expected,
        `${email} get ${key}`,
      );
      assert.equal(
        (
          await user.post(`/api/alumni/${id(key)}/tracking-events`, {
            isTracked: true,
            source: "scope-test",
          })
        ).status,
        inScope ? 201 : 404,
        `${email} tracking ${key}`,
      );
      assert.equal(
        (await user.post(`/api/alumni/${id(key)}/employments`, { employer: "Scope Test Employer" }))
          .status,
        inScope ? 201 : 404,
        `${email} employment ${key}`,
      );
      assert.equal(
        (
          await user.patch(`/api/alumni/${id(key)}`, {
            studentNumber: alumni[key].studentNumber,
            programId: String(alumni[key].programId),
            graduationYear: 2024,
          })
        ).status,
        expected,
        `${email} update ${key}`,
      );
    }
    const csv = await user.get("/api/reports/alumni.csv");
    assert.equal(csv.status, 200, `${email} export`);
    assert.equal((csv.body as { count: number }).count, allowed.length, `${email} export rows`);
    for (const key of all)
      assert.equal(
        String((csv.body as { csv: string }).csv).includes(alumni[key].studentNumber),
        allowed.includes(key),
        `${email} export contains ${key}`,
      );
    const dashboard = await user.get("/api/dashboard");
    assert.equal(dashboard.status, 200);
    assert.equal(
      (dashboard.body as { graduates: number }).graduates,
      allowed.length,
      `${email} dashboard`,
    );
    const download = await user.get(`/api/files/${String(evidence._id)}`);
    assert.equal(
      download.status,
      allowed.includes("GThree") ? 200 : 404,
      `${email} evidence download`,
    );
  }

  // A head cannot move an in-scope alumnus into another department's program.
  const moved = await as("department.head@collab.test").patch(`/api/alumni/${id("GOne")}`, {
    studentNumber: alumni.GOne.studentNumber,
    programId: bsed,
    graduationYear: 2024,
  });
  assert.equal(moved.status, 403);
  assert.equal(
    String((await db.Alumni.findById(id("GOne")).lean())!.programId),
    String(alumni.GOne.programId),
  );

  // Unlinked self-registered accounts carry no program, so scoped users never see them.
  assert.deepEqual(
    (await as("college.head@collab.test").get("/api/alumni/pending-accounts")).body,
    [],
  );

  // Reassignment takes effect on the next request: scope is resolved per request.
  const educationFaculty = await db.Faculty.findOne({ email: "faculty.education@collab.test" })
    .orFail()
    .lean();
  await db.Alumni.updateOne(
    { _id: alumni.GFour._id },
    { $set: { assignedFacultyId: educationFaculty._id } },
  );
  assert.equal(
    (await as("faculty.education@collab.test").get(`/api/alumni/${id("GFour")}`)).status,
    200,
  );
  await db.Faculty.updateOne({ _id: educationFaculty._id }, { $set: { active: false } });
  assert.equal(
    (await as("faculty.education@collab.test").get(`/api/alumni/${id("GFour")}`)).status,
    404,
  );

  // Administrators are unscoped (service level; HTTP would also require authenticator MFA).
  const admin = await db.User.findOne({ email: "synthetic-admin@example.test" }).orFail().lean();
  const adminUser = (await loadAuthUser(db, String(admin._id)))!;
  const context: Context = {
    db,
    user: { ...adminUser, mfaVerified: true },
    sessionToken: null,
    ipAddress: null,
    userAgent: null,
    integrationEnv: { uploadDir },
  };
  assert.equal((await alumniService.list(context, { page: 1, pageSize: 100 })).length, 4);
  assert.equal((await reportsService.alumniCsv(context, {})).count, 4);
  console.log(
    "PASS scope matrix: 7 roles x list/get/update/tracking/employment/export/dashboard/evidence, cross-department 404, program move 403, pending accounts, live reassignment and deactivation.",
  );
} finally {
  await db.connection.dropDatabase().catch(() => undefined);
  await db.disconnect();
  await rm(uploadDir, { recursive: true, force: true });
}
