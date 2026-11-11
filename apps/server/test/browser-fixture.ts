import path from "node:path";
import { startCiReplicaSet } from "./local/ci-replica-set";
import { existsSync } from "node:fs";
// Isolated browser-test server. Never imported by the production entrypoint.
import express from "express";
import { randomBytes } from "node:crypto";
import { generateSecret } from "otplib";
import {
  createDatabase,
  hashPassword,
  PERMISSION_KEYS,
  PERMISSIONS,
  ROLE_PRESETS,
} from "@Alumni-Tracking-Ss/db";
import { migrateDatabase } from "@Alumni-Tracking-Ss/db/migration";
import { encryptMfaSecret } from "@Alumni-Tracking-Ss/api/services/mfa";
import type { Context, IntegrationEnv } from "@Alumni-Tracking-Ss/api/context";
import { createApp } from "../src/app";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { invalidateIntegrationEnvCache } from "@Alumni-Tracking-Ss/api/integrations/credential-store";

if (process.env.NODE_ENV !== "test") throw new Error("Browser fixtures require NODE_ENV=test.");
process.env.PASSWORD_BREACH_CHECK = "local";
const stopTestReplicaSet = await startCiReplicaSet();
const databaseName = `collab_browser_${randomBytes(8).toString("hex")}`;
process.env.DATABASE_URL = `mongodb://127.0.0.1:27018/${databaseName}?replicaSet=rs0`;
const db = createDatabase({ DATABASE_URL: process.env.DATABASE_URL });
await db.ready();
const migration = await migrateDatabase(db, "apply");
if (migration.conflicts.length) throw new Error("Browser scratch database index setup failed.");
const ids = {
  admin: "000000000000000000000001",
  staff: "000000000000000000000002",
  alumni: "000000000000000000000003",
  adminRole: "000000000000000000000101",
  staffRole: "000000000000000000000102",
  viewerRole: "000000000000000000000103",
  college: "000000000000000000000300",
  department: "000000000000000000000301",
  program: "000000000000000000000302",
  alumniProfile: "000000000000000000000201",
  otherProfile: "000000000000000000000202",
};
const initialDate = new Date("2026-01-01T00:00:00.000Z");
const password = "BrowserTest123!";
const passwordHash = await hashPassword(password);
let resetLink = "",
  emailCode = "",
  failNext = false;
const verificationEnv: IntegrationEnv = {
  uploadDir: path.resolve(".tools/browser-uploads", databaseName),
  googleClientId: "synthetic-browser-client",
  googleClientSecret: "synthetic-browser-secret",
  appUrl: "http://127.0.0.1:3100",
  smtpUrl: "https://mail.example.test",
  verificationSecret: "synthetic-test-only-verification-key-1234567890",
  mfaEncryptionKey: "12".repeat(32),
  webOrigin: "http://127.0.0.1:3101",
  integrationEncryptionKey: "34".repeat(32),
  connectionTester: async (_key, values) => {
    // Reject if any value contains "reject"
    for (const value of Object.values(values)) {
      if (typeof value === "string" && value.includes("reject")) {
        throw new ApiError("BAD_REQUEST", {
          message: "Synthetic provider rejected the credentials.",
        });
      }
    }
  },
};
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (String(input) === "https://mail.example.test") {
    const body = JSON.parse(String(init?.body)) as { text: string };
    emailCode = body.text.match(/\b[0-9]{6}\b/)?.[0] ?? "";
    resetLink = body.text.match(/https?:\/\/[^\s]+\/reset-password#[^\s]+/)?.[0] ?? "";
    return Response.json({ ok: true });
  }
  return nativeFetch(input, init);
};
function createTestApplication() {
  const toolsDir = path.resolve(
    process.env.MONGODB_TOOLS_DIR ??
      `.tools/mongodb-database-tools-${process.platform === "win32" ? "windows" : "ubuntu2204"}-x86_64-100.20.1/bin`,
  );
  const toolsExist = existsSync(toolsDir);
  const backupDir = path.resolve(".tools/browser-backups", databaseName);
  const backupConfig = toolsExist
    ? {
        encryptionKey: "56".repeat(32),
        dir: backupDir,
        toolsDir,
        databaseUrl: process.env.DATABASE_URL!,
        uploadDir: verificationEnv.uploadDir!,
        appVersion: "1.0.0-test",
        mfaEncryptionKey: verificationEnv.mfaEncryptionKey!,
        integrationEncryptionKey: verificationEnv.integrationEncryptionKey!,
      }
    : undefined;
  return createApp({
    db,
    config: { nodeEnv: "test", origin: "http://127.0.0.1:3101" },
    integrationEnv: verificationEnv,
    backup: backupConfig,
  });
}
async function reset() {
  // Only the random namespace created above is eligible for fixture resets.
  if (db.connection.name !== databaseName || !/^collab_browser_[a-f0-9]{16}$/.test(databaseName))
    throw new Error("Refusing to reset a non-fixture database.");
  for (const collection of Object.values(db.connection.collections))
    await collection.deleteMany({});
  // Clear backup directory if it exists
  const backupDir = path.resolve(".tools/browser-backups", databaseName);
  const fs = await import("fs/promises");
  try {
    await fs.rm(backupDir, { recursive: true, force: true });
  } catch {
    // Directory may not exist yet
  }
  process.env.NODE_ENV = "test";
  process.env.LOCAL_DISABLE_MFA = "false";
  process.env.LOCAL_REQUIRE_EMAIL_VERIFICATION = "true";
  process.env.LOCAL_REQUIRE_PHONE_VERIFICATION = "true";
  emailCode = "";
  resetLink = "";
  failNext = false;
  verificationEnv.smsProvider = undefined;
  // Requests build their env from this object through a short cache; drop it after changes.
  invalidateIntegrationEnvCache();
  const permissions = PERMISSIONS.map((permission, index) => ({
    ...permission,
    _id: (0x1000 + index).toString(16).padStart(24, "0"),
  }));
  await db.Permission.insertMany(permissions);
  await db.Role.insertMany([
    {
      _id: ids.adminRole,
      key: "super_admin",
      name: "Test Admin",
      description: "Synthetic administrator",
      isSystem: true,
      updatedAt: initialDate,
    },
    {
      _id: ids.staffRole,
      key: "faculty",
      name: "Test Staff",
      description: "Synthetic role",
      isSystem: false,
      updatedAt: initialDate,
    },
    {
      _id: ids.viewerRole,
      key: "viewer",
      name: "Test Alumni",
      description: "Synthetic Alumni",
      isSystem: false,
      updatedAt: initialDate,
    },
  ]);
  await db.RolePermission.insertMany(
    permissions.map((permission) => ({ roleId: ids.adminRole, permissionId: permission._id })),
  );
  await db.User.create({
    _id: ids.admin,
    firstName: "Test",
    middleName: "",
    lastName: "Administrator",
    suffix: "",
    name: "Test Administrator",
    email: "admin@example.test",
    image: null,
    status: "active",
    passwordHash,
    emailVerified: true,
    phoneVerified: false,
    verificationRequired: false,
    phoneNumber: "",
    gender: "",
    facebookAccount: "",
    needsProfileCompletion: false,
  });
  await db.UserRole.create({ userId: ids.admin, roleId: ids.adminRole });
  await db.College.create({ _id: ids.college, name: "Synthetic College" });
  await db.Department.create({ _id: ids.department, collegeId: ids.college, name: "Synthetic IT" });
  await db.Program.create({
    _id: ids.program,
    code: "TEST_BSIT",
    name: "Synthetic BSIT",
    departmentId: ids.department,
  });
  await db.IntegrationSetting.insertMany([
    { key: "recaptcha", enabled: false },
    { key: "google_auth", enabled: false },
    { key: "email", enabled: true },
    { key: "google_drive", enabled: true },
    { key: "image_host", enabled: true },
    { key: "google_sheets", enabled: true },
    { key: "google_forms", enabled: false },
  ]);
}
await reset();
let testApplication = createTestApplication();
const app = express();
app.use("/__test", express.json({ limit: "16kb" }));
app.post("/__test/reset", async (_request, response) => {
  await reset();
  testApplication = createTestApplication();
  response.json({ ok: true });
});
app.post("/__test/local-mfa-policy", (request, response) => {
  const enabled = request.body?.enabled === true;
  process.env.NODE_ENV = enabled ? "development" : "test";
  process.env.LOCAL_DISABLE_MFA = enabled ? "true" : "false";
  response.json({ ok: true });
});
app.post("/__test/local-contact-policy", (request, response) => {
  const enabled = request.body?.enabled === true;
  process.env.LOCAL_REQUIRE_EMAIL_VERIFICATION = enabled ? "false" : "true";
  process.env.LOCAL_REQUIRE_PHONE_VERIFICATION = enabled ? "false" : "true";
  response.json({ ok: true });
});
app.post("/__test/google", async (_request, response) => {
  await db.IntegrationSetting.updateOne({ key: "google_auth" }, { $set: { enabled: true } }).exec();
  response.json({ ok: true });
});
app.post("/__test/incomplete", async (_request, response) => {
  await db.User.updateOne({ _id: ids.admin }, { $set: { needsProfileCompletion: true } }).exec();
  response.json({ ok: true });
});
app.get("/__test/code", (_request, response) => {
  response.json({ emailCode });
});
app.get("/__test/reset-link", (_request, response) => {
  response.json({ resetLink });
});
app.post("/__test/legacy-unverified-email", async (_request, response) => {
  await db.User.updateOne(
    { _id: ids.admin },
    { $set: { emailVerified: false, verificationRequired: false } },
  ).exec();
  response.json({ ok: true });
});
app.post("/__test/unverified", async (_request, response) => {
  await db.User.updateOne(
    { _id: ids.admin },
    {
      $set: {
        verificationRequired: true,
        emailVerified: false,
        phoneVerified: false,
        phoneNumber: "+639171234567",
        gender: "Female",
      },
    },
  ).exec();
  response.json({ ok: true });
});
app.post("/__test/password-required", async (_request, response) => {
  await db.User.updateOne(
    { _id: ids.admin },
    {
      $set: {
        passwordHash: null,
        verificationRequired: true,
        emailVerified: true,
        phoneVerified: true,
        phoneNumber: "+639171234567",
        gender: "Female",
      },
    },
  ).exec();
  await db.Session.updateMany(
    { userId: ids.admin },
    { $set: { googleVerifiedAt: new Date() } },
  ).exec();
  response.json({ ok: true });
});
app.post("/__test/stale-google", async (_request, response) => {
  await db.Session.updateMany(
    { userId: ids.admin },
    { $set: { googleVerifiedAt: new Date(Date.now() - 600_000) } },
  ).exec();
  response.json({ ok: true });
});
app.post("/__test/connect-sms", (_request, response) => {
  verificationEnv.smsProvider = {
    sendCode: async () => "synthetic-sms",
    checkCode: async (sid, phone, code) => {
      const user = await db.User.findById(ids.admin).lean().exec();
      return sid === "synthetic-sms" && phone === user?.phoneNumber && code === "654321";
    },
  };
  invalidateIntegrationEnvCache();
  response.json({ ok: true });
});
app.post("/__test/fail", (_request, response) => {
  failNext = true;
  response.json({ ok: true });
});
app.post("/__test/concurrent", async (_request, response) => {
  await db.Role.updateOne(
    { _id: ids.staffRole },
    { $set: { updatedAt: new Date(Date.now() + 60_000) } },
    { timestamps: false },
  ).exec();
  response.json({ ok: true });
});

async function grantRole(roleId: string, keys: readonly string[]) {
  const permissions = await db.Permission.find({ key: { $in: keys } })
    .lean()
    .exec();
  for (const permission of permissions)
    await db.RolePermission.updateOne(
      { roleId, permissionId: permission._id },
      { $setOnInsert: { roleId, permissionId: permission._id } },
      { upsert: true },
    ).exec();
}
async function historicalEnrollment(userId: string) {
  const secretCipher = encryptMfaSecret(
    { user: { id: userId }, integrationEnv: verificationEnv } as Context,
    generateSecret(),
  );
  await db.MfaCredential.updateOne(
    { userId },
    {
      $setOnInsert: {
        userId,
        version: "historic-browser-enrollment",
        secretCipher,
        recoveryHashes: [],
        lastStep: -1,
      },
    },
    { upsert: true },
  ).exec();
}
async function ensureAcademicFixtures() {
  await db.College.updateOne(
    { _id: ids.college },
    { $setOnInsert: { name: "Synthetic College" } },
    { upsert: true },
  ).exec();
  await db.Department.updateOne(
    { _id: ids.department },
    { $setOnInsert: { name: "Synthetic IT", collegeId: ids.college } },
    { upsert: true },
  ).exec();
  await db.Program.updateOne(
    { _id: ids.program },
    { $setOnInsert: { code: "TEST_BSIT", name: "Synthetic BSIT", departmentId: ids.department } },
    { upsert: true },
  ).exec();
  for (const [id, studentNumber, firstName] of [
    [ids.alumniProfile, "SYNTHETIC-OWN", "Test"],
    [ids.otherProfile, "SYNTHETIC-OTHER", "Unrelated"],
  ]) {
    await db.Alumni.updateOne(
      { _id: id },
      {
        $setOnInsert: {
          studentNumber,
          firstName,
          middleName: "",
          lastName: "Alumni",
          suffix: "",
          gender: "Female",
          programId: ids.program,
          isTracked: true,
          employmentStatus: "unknown",
        },
      },
      { upsert: true },
    ).exec();
  }
}
// The "staff" browser user is a college-level head over the synthetic college, holding the
// broad management permissions the retired Staff role used to have.
const HEAD_PERMISSIONS = PERMISSION_KEYS.filter(
  (key) =>
    !key.startsWith("users.") &&
    !key.startsWith("roles.") &&
    !key.startsWith("integrations.") &&
    key !== "permissions.read" &&
    key !== "audit.read",
);
app.post("/__test/staff", async (request, response) => {
  await ensureAcademicFixtures();
  await grantRole(
    ids.staffRole,
    request.body?.legacyIntegrations === true
      ? [...HEAD_PERMISSIONS, "integrations.read", "integrations.write"]
      : HEAD_PERMISSIONS,
  );
  await db.User.updateOne(
    { _id: ids.staff },
    {
      $setOnInsert: {
        firstName: "Test",
        middleName: "",
        lastName: "Staff",
        suffix: "",
        name: "Test Staff",
        email: "staff@example.test",
        passwordHash,
        status: "active",
        emailVerified: true,
        phoneVerified: true,
      },
    },
    { upsert: true },
  ).exec();
  await db.UserRole.updateOne(
    { userId: ids.staff, roleId: ids.staffRole },
    { $setOnInsert: { userId: ids.staff, roleId: ids.staffRole } },
    { upsert: true },
  ).exec();
  await db.Faculty.updateOne(
    { userId: ids.staff },
    {
      $setOnInsert: {
        userId: ids.staff,
        employeeNumber: "BROWSER-HEAD",
        firstName: "Test",
        lastName: "Staff",
        email: "staff@example.test",
        departmentId: ids.department,
        roleLevel: "college",
        active: true,
      },
    },
    { upsert: true },
  ).exec();
  await historicalEnrollment(ids.staff);
  response.json({
    email: "staff@example.test",
    password,
    id: ids.staff,
    alumniId: ids.alumniProfile,
  });
});
app.post("/__test/alumni", async (request, response) => {
  await ensureAcademicFixtures();
  await grantRole(ids.viewerRole, ROLE_PRESETS.viewer.permissions);
  await db.User.updateOne(
    { _id: ids.alumni },
    {
      $setOnInsert: {
        firstName: "Test",
        middleName: "",
        lastName: "Alumni",
        suffix: "",
        name: "Test Alumni",
        email: "alumni@example.test",
        passwordHash,
        status: "active",
        emailVerified: true,
        phoneVerified: true,
        alumniId: ids.alumniProfile,
      },
    },
    { upsert: true },
  ).exec();
  await db.UserRole.updateOne(
    { userId: ids.alumni, roleId: ids.viewerRole },
    { $setOnInsert: { userId: ids.alumni, roleId: ids.viewerRole } },
    { upsert: true },
  ).exec();
  await historicalEnrollment(ids.alumni);
  if (request.body?.unlinked === true)
    await db.User.updateOne(
      { _id: ids.alumni },
      { $set: { alumniId: null, needsProfileCompletion: false } },
    ).exec();
  response.json({
    email: "alumni@example.test",
    password,
    id: ids.alumni,
    alumniId: ids.alumniProfile,
    otherAlumniId: ids.otherProfile,
  });
});
app.post("/__test/other-alumni", async (_request, response) => {
  await ensureAcademicFixtures();
  await grantRole(ids.viewerRole, ROLE_PRESETS.viewer.permissions);
  const id = "000000000000000000000004";
  await db.User.updateOne(
    { _id: id },
    {
      $setOnInsert: {
        firstName: "Second",
        middleName: "",
        lastName: "Graduate",
        suffix: "",
        name: "Second Graduate",
        email: "other.alumni@example.test",
        passwordHash,
        status: "active",
        emailVerified: true,
        phoneVerified: true,
        alumniId: ids.otherProfile,
      },
    },
    { upsert: true },
  ).exec();
  await db.UserRole.updateOne(
    { userId: id, roleId: ids.viewerRole },
    { $setOnInsert: { userId: id, roleId: ids.viewerRole } },
    { upsert: true },
  ).exec();
  await db.Alumni.updateOne(
    { _id: ids.otherProfile },
    { $set: { firstName: "Second", lastName: "Graduate" } },
  ).exec();
  response.json({ email: "other.alumni@example.test", password, id, alumniId: ids.otherProfile });
});
// Only this test server can inject a single roles-save failure.
app.patch(["/api/roles/:id", "/api/v1/roles/:id"], (_request, response, next) => {
  if (!failNext) return next();
  failNext = false;
  response.status(500).json({ error: "Synthetic database failure", code: "INTERNAL_SERVER_ERROR" });
});
app.use((request, response, next) => {
  testApplication(request, response, next);
});
const server = app.listen(3100, "127.0.0.1");
function shutdown() {
  server.close(() => {
    void db
      .disconnect()
      .then(() => stopTestReplicaSet?.())
      .finally(() => process.exit(0));
  });
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
