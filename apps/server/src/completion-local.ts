import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import path from "node:path";
import request from "supertest";
import { createDatabase } from "@Alumni-Tracking-Ss/db";
import { migrateDatabase } from "@Alumni-Tracking-Ss/db/migration";
import { seedDatabase } from "@Alumni-Tracking-Ss/db/seed-data";
import { createApp } from "./app";
import {
  createSession,
  loadAuthUser,
  upsertGoogleUser,
} from "@Alumni-Tracking-Ss/api/services/session";
import { usersService } from "./modules/users/service";
import { usersSchemas } from "@Alumni-Tracking-Ss/contracts/users";
import type { Context } from "@Alumni-Tracking-Ss/api/context";

if (process.env.NODE_ENV === "production") throw new Error("Synthetic local acceptance only.");
process.env.NODE_ENV = "test";
process.env.PASSWORD_BREACH_CHECK = "local";
process.env.LOCAL_REQUIRE_EMAIL_VERIFICATION = "false";
process.env.LOCAL_REQUIRE_PHONE_VERIFICATION = "false";
process.env.DATABASE_URL = `mongodb://127.0.0.1:27018/collab_completion_${randomBytes(8).toString("hex")}?replicaSet=rs0`;
process.env.SEED_ADMIN_EMAIL = "synthetic-admin@example.test";
process.env.SEED_ADMIN_PASSWORD = randomBytes(24).toString("base64url");
process.env.SEED_DEMO_DATA = "false";
let stopTestReplicaSet: (() => Promise<void>) | undefined;
if (process.env.CI === "true") {
  const { MongoMemoryReplSet } = await import("mongodb-memory-server-core");
  const replicaSet = await MongoMemoryReplSet.create({
    binary: { version: "9.0.0" },
    replSet: { count: 1, name: "rs0", storageEngine: "wiredTiger" },
    instanceOpts: [{ port: 27018 }],
  });
  stopTestReplicaSet = async () => {
    await replicaSet.stop();
  };
}
const db = createDatabase({ DATABASE_URL: process.env.DATABASE_URL });
const origin = "http://localhost:3001";
try {
  assert.deepEqual((await migrateDatabase(db, "apply")).conflicts, []);
  await seedDatabase(db);
  const department = await db.Department.create({ name: "Synthetic college" });
  const program = await db.Program.create({
    code: "TEST",
    name: "Synthetic degree",
    departmentId: department._id,
  });
  const app = createApp({
    db,
    config: { nodeEnv: "test", origin },
    integrationEnv: {
      uploadDir: path.resolve(".tools/completion-uploads", randomBytes(8).toString("hex")),
    },
  });
  const agent = request.agent(app);
  const signup = {
    firstName: "María José",
    lastName: "Dela Cruz-O'Neill",
    suffix: "de la Casa",
    email: "alumni@example.test",
    password: "Synthetic registration passphrase 123!",
    phoneNumber: "+639171234567",
    gender: "Female",
    studentNumber: "SYN-001",
    graduationYear: 2024,
    programId: String(program._id),
    recaptchaFallback: true,
  };
  const response = await agent.post("/api/auth/signup").set("Origin", origin).send(signup);
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.deepEqual(response.body.user.roles, ["viewer"]);
  assert.equal(response.body.user.needsProfileCompletion, false);
  assert.ok(response.body.user.alumniId);
  const user = await db.User.findOne({ email: signup.email }).lean().orFail();
  assert.equal(user.emailVerified, false);
  assert.equal(user.phoneVerified, false);
  assert.notEqual(user.passwordHash, signup.password);
  assert.equal(await db.Alumni.countDocuments(), 1);
  const profile = await agent.get("/api/me/profile");
  assert.equal(profile.status, 200);
  assert.equal(profile.body.studentNumber, "SYN-001");
  assert.equal(profile.body.isTracked, false);
  const job = {
    employer: "Synthetic University",
    jobTitle: "Research assistant",
    industry: "Education",
    location: "Manila",
    startDate: "2025-01-01T00:00:00Z",
    isCurrent: true,
  };
  const added = await agent.post("/api/me/employments").set("Origin", origin).send(job);
  assert.equal(added.status, 201, JSON.stringify(added.body));
  assert.equal(
    (
      await agent
        .patch(`/api/me/employments/${added.body.id}`)
        .set("Origin", origin)
        .send({ ...job, jobTitle: "Graduate researcher" })
    ).status,
    200,
  );
  assert.equal(
    (
      await agent
        .post("/api/me/employments")
        .set("Origin", origin)
        .send({ ...job, alumniId: "111111111111111111111111" })
    ).status,
    400,
  );
  assert.equal(
    (
      await agent
        .post("/api/me/employments")
        .set("Origin", origin)
        .send({ ...job, startDate: "2026-01-01T00:00:00Z", endDate: "2025-01-01T00:00:00Z" })
    ).status,
    400,
  );
  // Existing pre-migration jobs may contain contradictory current flags.
  await db.Employment.insertMany([
    { alumniId: user.alumniId, employer: "Legacy A", isCurrent: true, status: "employed" },
    { alumniId: user.alumniId, employer: "Legacy B", isCurrent: true, status: "employed" },
    {
      alumniId: user.alumniId,
      employer: "Legacy ended",
      isCurrent: true,
      status: "employed",
      endDate: new Date("2025-01-01"),
    },
  ]);
  assert.equal(
    (
      await agent
        .patch(`/api/me/employments/${added.body.id}`)
        .set("Origin", origin)
        .send({ ...job, isCurrent: false })
    ).status,
    200,
  );
  assert.equal(
    await db.Employment.countDocuments({ alumniId: user.alumniId, isCurrent: true }),
    1,
    "An authorized edit must reconcile legacy current flags.",
  );
  assert.equal(
    await db.Employment.countDocuments({
      alumniId: user.alumniId,
      isCurrent: true,
      endDate: { $ne: null },
    }),
    0,
  );
  const concurrentJobs = await Promise.all(
    ["A", "B"].map((employer) =>
      agent
        .post("/api/me/employments")
        .set("Origin", origin)
        .send({ ...job, employer }),
    ),
  );
  assert.ok(
    concurrentJobs.every((r) => r.status === 201),
    JSON.stringify(concurrentJobs.map((r) => r.body)),
  );
  assert.equal(await db.Employment.countDocuments({ alumniId: user.alumniId, isCurrent: true }), 1);
  assert.equal(
    (await db.Alumni.findById(user.alumniId).lean().orFail()).employmentStatus,
    "employed",
  );
  assert.equal((await db.Alumni.findById(user.alumniId).lean().orFail()).isTracked, false);
  const otherProfile = await db.Alumni.create({
    studentNumber: "OTHER",
    firstName: "Other",
    lastName: "Graduate",
    programId: program._id,
  });
  const otherJob = await db.Employment.create({
    alumniId: otherProfile._id,
    employer: "Private other job",
  });
  assert.equal(
    (await agent.patch(`/api/me/employments/${otherJob._id}`).set("Origin", origin).send(job))
      .status,
    403,
  );
  assert.equal(
    (await agent.delete(`/api/me/employments/${otherJob._id}`).set("Origin", origin)).status,
    403,
  );
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=",
    "base64",
  );
  const uploaded = await agent
    .post("/api/me/files")
    .set("Origin", origin)
    .field("kind", "evidence")
    .field("employmentId", added.body.id)
    .attach("file", png, { filename: "synthetic-proof.png", contentType: "image/png" });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
  assert.equal((await agent.get(`/api/me/files/${uploaded.body.id}`)).status, 200);
  const hostile = await agent
    .post("/api/me/files")
    .set("Origin", origin)
    .field("alumniId", String(otherProfile._id))
    .attach("file", png, { filename: "forged.png", contentType: "image/png" });
  assert.equal(hostile.status, 400);
  const foreignFile = await db.EvidenceFile.create({
    alumniId: otherProfile._id,
    originalName: "Private.png",
    mimeType: "image/png",
    provider: "local",
    storageKey: "not-read",
    sizeBytes: 10,
  });
  assert.equal((await agent.get(`/api/me/files/${foreignFile._id}`)).status, 403);
  assert.equal(
    (await agent.delete(`/api/me/files/${foreignFile._id}`).set("Origin", origin)).status,
    403,
  );
  assert.equal(
    (await agent.delete(`/api/me/files/${uploaded.body.id}`).set("Origin", origin)).status,
    200,
  );
  assert.ok((await db.EvidenceFile.findById(uploaded.body.id).lean().orFail()).deletedAt);
  assert.equal((await agent.get(`/api/me/files/${uploaded.body.id}`)).status, 404);
  for (const ownJob of await db.Employment.find({ alumniId: user.alumniId }).lean())
    assert.equal(
      (await agent.delete(`/api/me/employments/${ownJob._id}`).set("Origin", origin)).status,
      200,
    );
  assert.equal(
    (await db.Alumni.findById(user.alumniId).lean().orFail()).employmentStatus,
    "unknown",
  );
  const privateTotals = await agent.get("/api/me/statistics");
  assert.equal(privateTotals.status, 200);
  assert.equal(privateTotals.body.suppressed, true);
  assert.equal(privateTotals.body.totals, null);
  const before = await db.User.countDocuments();
  const duplicates = await Promise.all(
    ["two", "three"].map((name) =>
      request(app)
        .post("/api/auth/signup")
        .set("Origin", origin)
        .send({ ...signup, email: `${name}@example.test`, studentNumber: "RACE" }),
    ),
  );
  assert.deepEqual(duplicates.map((r) => r.status).sort(), [201, 409]);
  assert.equal(await db.User.countDocuments(), before + 1);
  assert.equal(await db.Alumni.countDocuments({ studentNumber: "RACE" }), 1);
  await db.Alumni.create({
    studentNumber: "LEGACY",
    firstName: "Imported",
    lastName: "Graduate",
    programId: program._id,
    personalEmail: "claim@example.test",
  });
  const claim = await request(app)
    .post("/api/auth/signup")
    .set("Origin", origin)
    .send({ ...signup, email: "claim@example.test", studentNumber: "LEGACY" });
  assert.equal(claim.status, 409);
  assert.match(claim.body.error, /review|administrator/i);
  assert.equal(await db.User.countDocuments({ email: "claim@example.test" }), 0);
  const google = await upsertGoogleUser(db, {
    email: "google@example.test",
    name: "Unsplit provider name",
  });
  assert.equal(google.name, "Unsplit provider name");
  const googleSession = await createSession(db, google.id, { googleVerifiedAt: new Date() });
  const googleAgent = request.agent(app);
  const googleProfile = {
    firstName: "Confirmed",
    lastName: "Google Graduate",
    phoneNumber: "+639171234568",
    gender: "Female",
    studentNumber: "GOOGLE-001",
    graduationYear: 2024,
    programId: String(program._id),
  };
  assert.equal(
    (
      await googleAgent
        .patch("/api/auth/profile-completion")
        .set("Origin", origin)
        .set("Cookie", `ats_session=${googleSession.token}`)
        .send(googleProfile)
    ).status,
    200,
  );
  const linkedGoogle = await db.User.findById(google.id).lean().orFail();
  assert.ok(linkedGoogle.alumniId);
  assert.equal(await db.Alumni.countDocuments({ studentNumber: "GOOGLE-001" }), 1);
  const passwordCreation = await googleAgent
    .post("/api/auth/password")
    .set("Origin", origin)
    .set("Cookie", `ats_session=${googleSession.token}`)
    .send({
      password: "A synthetic Google passphrase 4321!",
      confirmation: "A synthetic Google passphrase 4321!",
    });
  assert.equal(passwordCreation.status, 200, JSON.stringify(passwordCreation.body));
  assert.equal((await googleAgent.get("/api/me/profile")).status, 200);
  const staffRole = await db.Role.findOne({ key: "staff" }).lean().orFail();
  const staff = await db.User.create({
    name: "Synthetic staff",
    email: "staff@example.test",
    passwordHash: user.passwordHash,
  });
  await db.UserRole.create({ userId: staff._id, roleId: staffRole._id });
  const staffSession = await createSession(db, String(staff._id), {});
  const staffHeaders = { Authorization: `Bearer ${staffSession.token}`, Origin: origin };
  assert.equal(
    (
      await request(app)
        .patch("/api/integrations/recaptcha")
        .set(staffHeaders)
        .send({ enabled: false })
    ).status,
    403,
  );
  assert.equal((await request(app).get("/api/faculty").set(staffHeaders)).status, 404);
  const summary = await request(app).get("/api/dashboard").set(staffHeaders);
  const nameSearch = await request(app)
    .get("/api/alumni")
    .query({ search: "María José Dela Cruz" })
    .set(staffHeaders);
  assert.equal(nameSearch.body.length, 2);
  assert.deepEqual(
    nameSearch.body.map((row: { studentNumber: string }) => row.studentNumber).sort(),
    ["RACE", "SYN-001"],
  );
  const report = await request(app).get("/api/reports").set(staffHeaders);
  assert.equal(summary.body.graduates, 5);
  assert.equal(summary.body.registered, 3);
  assert.equal(report.body.graduates, summary.body.graduates);
  assert.equal(report.body.tracked, summary.body.tracked);
  assert.equal(report.body.untracked + report.body.tracked, report.body.graduates);
  const csv = await request(app).get("/api/reports/alumni.csv").set(staffHeaders);
  assert.equal(csv.status, 200);
  assert.equal(csv.body.count, 5);
  assert.match(csv.body.csv, /suffix/);
  assert.match(csv.body.csv, /de la Casa/);
  const filteredReport = await request(app).get("/api/reports?tracked=tracked").set(staffHeaders);
  const filteredDashboard = await request(app)
    .get("/api/dashboard?tracked=tracked")
    .set(staffHeaders);
  assert.equal(filteredReport.body.graduates, 0);
  assert.equal(filteredDashboard.body.graduates, 0);
  assert.equal(filteredReport.body.percentTracked, 0);
  assert.equal(filteredReport.body.registered, 0);
  const published = await agent.get("/api/me/statistics");
  assert.equal(published.body.suppressed, false);
  assert.equal(published.body.totals.graduates, 5);
  assert.equal(published.body.totals.percentTracked, 0);
  assert.equal("registered" in published.body.totals, false);
  const smallDepartment = await db.Department.create({
    name: "Synthetic small cohort",
  });
  const smallProgram = await db.Program.create({
    code: "SMALL",
    name: "Synthetic small program",
    departmentId: smallDepartment._id,
  });
  await db.Alumni.create({
    studentNumber: "SMALL-1",
    firstName: "Private",
    lastName: "Cohort",
    programId: smallProgram._id,
  });
  assert.deepEqual((await agent.get("/api/me/statistics")).body.byDepartment, []);
  assert.equal(
    (await agent.get(`/api/me/statistics?departmentId=${smallDepartment._id}`)).status,
    400,
  );
  await db.Alumni.updateOne({ _id: user.alumniId }, { $set: { deletedAt: new Date() } });
  assert.equal((await agent.get("/api/me/profile")).status, 404);
  assert.ok(await db.User.findById(user._id));
  await db.Alumni.updateOne({ _id: user.alumniId }, { $unset: { deletedAt: 1 } });
  process.env.LOCAL_REQUIRE_EMAIL_VERIFICATION = "true";
  process.env.LOCAL_REQUIRE_PHONE_VERIFICATION = "true";
  assert.equal((await agent.get("/api/me/profile")).status, 403);
  process.env.LOCAL_REQUIRE_EMAIL_VERIFICATION = "false";
  process.env.LOCAL_REQUIRE_PHONE_VERIFICATION = "false";
  const admin = await db.User.findOne({ email: process.env.SEED_ADMIN_EMAIL }).lean().orFail();
  const adminContext = {
    db,
    user: { ...(await loadAuthUser(db, String(admin._id)))!, mfaVerified: true },
    sessionToken: null,
    ipAddress: null,
    userAgent: null,
    integrationEnv: {},
  } as Context;
  await db.Role.updateOne({ key: "viewer" }, { $set: { name: "Viewer" } });
  const member = await usersService.create(
    adminContext,
    usersSchemas.create.input.parse({
      firstName: "Managed",
      lastName: "Staff",
      email: "managed@example.test",
      password: "Synthetic managed staff passphrase 123!",
    }),
  );
  assert.equal(member.userRoles[0]?.role.key, "staff");
  assert.equal(member.alumniId, null);
  const managedList = await request(app)
    .get("/api/alumni?search=managed@example.test")
    .set(staffHeaders);
  assert.equal(managedList.status, 200);
  assert.deepEqual(managedList.body, []);
  const viewer = await db.Role.findOne({ key: "viewer" }).lean().orFail();
  await assert.rejects(
    () =>
      usersService.create(
        adminContext,
        usersSchemas.create.input.parse({
          firstName: "Rejected",
          lastName: "Alumni",
          email: "rejected@example.test",
          password: "Synthetic rejected alumni passphrase 123!",
          roleIds: [String(viewer._id)],
        }),
      ),
    /only have Staff or Super Admin/,
  );
  assert.equal(await db.User.countDocuments({ email: "rejected@example.test" }), 0);
  const pendingGoogle = await upsertGoogleUser(db, {
    email: "pending@example.test",
    name: "Pending Graduate",
  });
  const viewerRole = await db.Role.findOne({ key: "viewer" }).lean().orFail();
  const mixed = await db.User.create({
    name: "Mixed Staff",
    email: "mixed@example.test",
    passwordHash: user.passwordHash,
  });
  await db.UserRole.insertMany([
    { userId: mixed._id, roleId: viewerRole._id },
    { userId: mixed._id, roleId: staffRole._id },
  ]);
  const graduatesBefore = (await request(app).get("/api/dashboard").set(staffHeaders)).body
    .graduates;
  const pending = await request(app).get("/api/alumni/pending-accounts").set(staffHeaders);
  assert.equal(pending.status, 200, JSON.stringify(pending.body));
  assert.deepEqual(
    pending.body.map((u: { email: string }) => u.email),
    ["pending@example.test"],
  );
  assert.deepEqual(Object.keys(pending.body[0]).sort(), ["createdAt", "email", "id", "name"]);
  assert.equal(
    (await request(app).get("/api/alumni/pending-accounts?search=no-match").set(staffHeaders)).body
      .length,
    0,
  );
  assert.equal(
    (await request(app).get("/api/alumni/pending-accounts?pageSize=1&page=2").set(staffHeaders))
      .body.length,
    0,
  );
  assert.equal((await agent.get("/api/alumni/pending-accounts")).status, 403);
  assert.equal((await request(app).get("/api/alumni/pending-accounts")).status, 401);
  assert.equal(
    (await request(app).get("/api/dashboard").set(staffHeaders)).body.graduates,
    graduatesBefore,
  );
  const pendingSession = await createSession(db, pendingGoogle.id, {
    googleVerifiedAt: new Date(),
  });
  const completion = await request(app)
    .patch("/api/auth/profile-completion")
    .set("Origin", origin)
    .set("Cookie", `ats_session=${pendingSession.token}`)
    .send({ ...googleProfile, studentNumber: "PENDING-001" });
  assert.equal(completion.status, 200, JSON.stringify(completion.body));
  assert.equal(
    (await request(app).get("/api/alumni/pending-accounts").set(staffHeaders)).body.length,
    0,
  );
  const completedList = await request(app).get("/api/alumni?search=PENDING-001").set(staffHeaders);
  assert.equal(completedList.body[0]?.isRegistered, true);
  console.log(
    "PASS registration/races, managed Staff creation/default and Alumni creation denial, pending account visibility/privacy/completion, contact policy, jobs/files/ownership, retired Faculty routes, reports and statistics.",
  );
} finally {
  await db.disconnect();
  await stopTestReplicaSet?.();
}
