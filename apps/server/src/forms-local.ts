import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generate } from "otplib";
import { createApp } from "./app";
import { acceptanceRequest } from "./local-rest";
import { migrateDatabase } from "../../../packages/db/src/migration";
import { createDatabase, hashPassword } from "../../../packages/db/src/index";
import type { Database } from "../../../packages/db/src/index";
import { PERMISSIONS, ROLE_PRESETS } from "../../../packages/db/src/permissions";
import { createSession } from "../../../packages/api/src/services/session";
import { projectRoot } from "../../../scripts/local-tools.mjs";
import { isManagedLocalDatabase } from "../../../scripts/local-env.mjs";
if (process.env.NODE_ENV === "production") throw Error("Local tests only");
process.env.NODE_ENV = "test";
process.env.PASSWORD_BREACH_CHECK = "local";
const name = `collab_forms_${randomBytes(6).toString("hex")}`;
const url = `mongodb://127.0.0.1:27018/${name}?replicaSet=rs0`;
assert.ok(isManagedLocalDatabase(url));
const db = createDatabase({ DATABASE_URL: url });
await db.ready();
assert.deepEqual((await migrateDatabase(db, "apply")).conflicts, []);
const peer = createDatabase({ DATABASE_URL: url });
const secret = "synthetic-forms-secret-only";
const failingImportJob = new Proxy(db.ImportJob, {
  get(target, key, receiver) {
    if (key === "create")
      return async () => {
        throw new Error("SYNTHETIC_PRIVATE_DATABASE_FAILURE");
      };
    return Reflect.get(target, key, receiver) as unknown;
  },
});
const faultDb: Database = {
  ...db,
  transaction: <T>(work: (tx: Database) => Promise<T>): Promise<T> =>
    db.transaction((tx) => work({ ...tx, ImportJob: failingImportJob })),
};
const servers: ReturnType<ReturnType<typeof createApp>["listen"]>[] = [];
const config = { nodeEnv: "test", origin: "http://localhost:3001" };
const integrationEnv = { googleFormsWebhookSecret: secret, mfaEncryptionKey: "47".repeat(32) };
async function listen(database: Database, env = integrationEnv) {
  const app = createApp({ db: database, config, integrationEnv: env });
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  if (!server.listening) await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}
const endpoint = "/api/integrations/google-forms/webhook";
const checks: { test: string; status: number }[] = [];
const payload = {
  studentNumber: "FORM-1",
  graduationYear: 2024,
  firstName: "Synthetic",
  lastName: "Forms",
  gender: "Female",
  departmentName: "Synthetic",
  programCode: "TEST",
};
async function submit(
  base: string,
  key: string | undefined,
  input: unknown = payload,
  token = secret,
) {
  const r = await fetch(base + endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": token,
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(10000),
  });
  return {
    status: r.status,
    body: (await r.json()) as { replayed?: boolean; importJobId?: string; error?: string },
  };
}
async function expected(
  test: string,
  base: string,
  key: string | undefined,
  status: number,
  input: unknown = payload,
  token = secret,
) {
  const r = await submit(base, key, input, token);
  assert.equal(r.status, status, `${test}: ${JSON.stringify(r.body)}`);
  checks.push({ test, status: r.status });
  return r;
}
try {
  await db.IntegrationSetting.create({ key: "google_forms", enabled: false });
  const base = await listen(db),
    second = await listen(peer),
    fault = await listen(faultDb);
  await expected("disabled integration", base, "synthetic-response-001", 403);
  // Enable only this newly created disposable database, never application settings.
  await db.IntegrationSetting.findOneAndUpdate(
    { key: "google_forms" },
    { $set: { enabled: true } },
    { returnDocument: "after" },
  );
  await expected("wrong shared secret", base, "synthetic-response-001", 401, payload, "wrong");
  const unconfigured = await listen(db, { ...integrationEnv, googleFormsWebhookSecret: "" });
  await expected("unconfigured secret", unconfigured, "synthetic-response-001", 401);
  await expected("missing key", base, undefined, 400);
  await expected("invalid payload", base, "synthetic-invalid-001", 400, { ...payload, gender: "" });
  await expected("domain error rollback", base, "synthetic-domain-001", 400);
  assert.equal(await db.FormsReceipt.countDocuments({}), 0);
  assert.equal(await db.ImportJob.countDocuments({}), 0);
  assert.equal(await db.Alumni.countDocuments({}), 0);
  const department = await db.Department.create({ name: "Synthetic" });
  await db.Program.create({ code: "TEST", name: "Synthetic", departmentId: department.id });
  const first = await expected("first commit", base, "synthetic-response-001", 200);
  const saved = await db.Alumni.findOne({ studentNumber: payload.studentNumber }).orFail();
  const retry = await expected(
    "serial duplicate another instance",
    second,
    "synthetic-response-001",
    200,
  );
  assert.equal(retry.body.replayed, true);
  assert.equal(retry.body.importJobId, first.body.importJobId);
  assert.equal(
    (await db.Alumni.findOne({ _id: saved.id }).orFail()).lastTrackedAt?.getTime(),
    saved.lastTrackedAt?.getTime(),
  );
  await expected("changed payload reuses key", base, "synthetic-response-001", 409, {
    ...payload,
    firstName: "Changed",
  });
  const concurrentPayload = { ...payload, studentNumber: "FORM-CONCURRENT" };
  const concurrent = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      submit(i % 2 ? base : second, "synthetic-concurrent-001", concurrentPayload),
    ),
  );
  assert.ok(concurrent.every((r) => [200, 503].includes(r.status)));
  const settled = await Promise.all(
    concurrent.map((r) =>
      r.status === 503 ? submit(base, "synthetic-concurrent-001", concurrentPayload) : r,
    ),
  );
  assert.ok(settled.every((r) => r.status === 200));
  assert.equal(new Set(settled.map((r) => r.body.importJobId)).size, 1);
  checks.push({ test: "8 concurrent deliveries / same committed job", status: 200 });
  assert.equal(await db.Alumni.countDocuments({}), 2);
  assert.equal(await db.TrackingEvent.countDocuments({}), 2);
  assert.equal(await db.FormsReceipt.countDocuments({}), 2);
  assert.equal(await db.ImportJob.countDocuments({}), 2);
  const failedPayload = { ...payload, studentNumber: "FORM-FAULT" };
  const failed = await expected(
    "injected partial failure",
    fault,
    "synthetic-fault-001",
    500,
    failedPayload,
  );
  assert.ok(!JSON.stringify(failed.body).includes("SYNTHETIC_PRIVATE"));
  assert.equal(await db.Alumni.findOne({ studentNumber: failedPayload.studentNumber }), null);
  assert.equal(await db.FormsReceipt.countDocuments({}), 2);
  assert.equal(await db.ImportJob.countDocuments({}), 2);
  assert.equal(await db.TrackingEvent.countDocuments({}), 2);
  await expected(
    "same key retries after rollback",
    second,
    "synthetic-fault-001",
    200,
    failedPayload,
  );
  const sameStudent = { ...payload, studentNumber: "FORM-DISTINCT-KEYS" };
  const distinct = await Promise.all(
    ["synthetic-distinct-001", "synthetic-distinct-002"].map((key, i) =>
      submit(i ? base : second, key, sameStudent),
    ),
  );
  for (const [i, result] of distinct.entries())
    if (result.status === 503)
      assert.equal((await submit(base, `synthetic-distinct-00${i + 1}`, sameStudent)).status, 200);
    else assert.equal(result.status, 200);
  assert.equal(await db.Alumni.countDocuments({}), 4);
  assert.equal(await db.TrackingEvent.countDocuments({}), 4);
  assert.equal(await db.FormsReceipt.countDocuments({}), 5);
  assert.equal(await db.ImportJob.countDocuments({}), 5);
  checks.push({ test: "distinct response IDs same student: one alumni record", status: 200 });
  const archived = await db.Alumni.findOne({ studentNumber: sameStudent.studentNumber }).orFail();
  await db.Alumni.findOneAndUpdate(
    { _id: archived.id },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  );
  await expected(
    "archived alumni cannot be changed",
    base,
    "synthetic-archived-001",
    400,
    sameStudent,
  );
  assert.equal(await db.FormsReceipt.countDocuments({}), 5);
  await expected("new response updates existing profile", base, "synthetic-update-001", 200, {
    ...payload,
    firstName: "Newer synthetic",
  });
  await expected(
    "old response replay preserves newer update",
    second,
    "synthetic-response-001",
    200,
  );
  assert.equal((await db.Alumni.findOne({ _id: saved.id }).orFail()).firstName, "Newer synthetic");
  assert.equal(await db.FormsReceipt.countDocuments({}), 6);
  assert.equal(await db.ImportJob.countDocuments({}), 6);
  const receipt = await db.FormsReceipt.findOne({}).orFail();
  assert.ok(!JSON.stringify(receipt).includes("Synthetic"));
  // Seed the exact default presets. No private/live role assignments are read.
  const perms = await Promise.all(PERMISSIONS.map((p) => db.Permission.create(p)));
  const password = "Synthetic role verification passphrase 872!";
  const passwordHash = await hashPassword(password);
  async function rest(route: string, token: string, input: unknown = {}) {
    const result = await acceptanceRequest(base, route, input, token);
    return { status: result.response.status, body: result.body as Record<string, unknown> };
  }
  const users: Record<string, { id: string; token: string }> = {};
  for (const preset of Object.values(ROLE_PRESETS)) {
    const role = await db.Role.create({ key: preset.key, name: preset.name });
    for (const permission of perms.filter((permission) =>
      (preset.permissions as readonly string[]).includes(permission.key),
    ))
      await db.RolePermission.create({ roleId: role._id, permissionId: permission._id });
    const user = await db.User.create({
      name: preset.name,
      email: `${preset.key}@example.test`,
      passwordHash,
      emailVerified: true,
    });
    await db.UserRole.create({ userId: user._id, roleId: role._id });
    let token = (await createSession(db, user.id, {})).token;
    if (preset.key === "super_admin") {
      assert.equal((await rest("alumni/list", token)).status, 403);
      const setup = await rest("auth/beginMfa", token, { password });
      assert.equal(setup.status, 200);
      const confirmation = await rest("auth/confirmMfa", token, {
        code: await generate({ secret: String(setup.body.secret) }),
      });
      assert.equal(confirmation.status, 200);
      token = String(confirmation.body.sessionToken);
    }
    if (preset.key === "staff")
      assert.equal((await rest("alumni/list", token)).status, 200, "Staff does not require MFA");
    users[preset.key] = { id: user.id, token };
  }
  for (const [role, route, status] of [
    ["viewer", "users/list", 403],
    ["viewer", "reports/alumniCsv", 403],
    ["staff", "users/list", 403],
    ["staff", "reports/alumniCsv", 200],
    ["super_admin", "users/list", 200],
  ] as const) {
    assert.equal((await rest(route, users[role]!.token)).status, status);
    checks.push({ test: `${role}: ${route}`, status });
  }
  const globalRead = await rest("alumni/get", users.viewer!.token, { id: saved.id });
  assert.equal(globalRead.status, 403);
  checks.push({ test: "Alumni cannot read the global directory", status: 403 });
  const unlinked = await acceptanceRequest(
    base,
    "/api/me/profile",
    {},
    users.viewer!.token,
    {},
    "GET",
  );
  assert.equal(unlinked.response.status, 409);
  await db.User.updateOne({ _id: users.viewer!.id }, { $set: { alumniId: saved._id } });
  assert.equal(
    (await acceptanceRequest(base, "/api/me/profile", {}, users.viewer!.token, {}, "GET")).response
      .status,
    200,
  );
  checks.push({
    test: "Alumni requires explicit link and then reads its own profile",
    status: 200,
  });
  assert.equal((await rest("alumni/delete", users.viewer!.token, { id: saved.id })).status, 403);
  assert.equal(
    (
      await rest("auth/updateProfile", users.viewer!.token, {
        firstName: "Own",
        lastName: "Synthetic",
        userId: users.super_admin!.id,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await rest("auth/updateProfile", users.viewer!.token, {
        firstName: "Own",
        lastName: "Synthetic",
      })
    ).status,
    200,
  );
  assert.equal(
    (await db.User.findOne({ _id: users.super_admin!.id }).orFail()).name,
    "Super Admin",
  );
  checks.push({
    test: "profile userId manipulation rejected; explicit own names update succeeds",
    status: 200,
  });
  await db.IntegrationSetting.findOneAndUpdate(
    { key: "google_forms" },
    { $set: { enabled: false } },
    { returnDocument: "after" },
  );
  await expected("disabled even on known replay", base, "synthetic-response-001", 403);
  const result = {
    date: new Date().toISOString(),
    database: name,
    checks,
    concurrentStatuses: concurrent.map((x) => x.status),
    counts: {
      alumni: await db.Alumni.countDocuments({}),
      tracking: await db.TrackingEvent.countDocuments({}),
      receipts: await db.FormsReceipt.countDocuments({}),
      jobs: await db.ImportJob.countDocuments({}),
    },
    formsEnabledAtEnd: false,
    limits: [
      "only synthetic loopback data",
      "same-key atomic DB effects, no provider exactly-once claim",
      "custom roles use union of explicit permissions; Alumni directory denied; explicit ownership link required",
    ],
  };
  await mkdir(path.join(projectRoot, ".tools"), { recursive: true });
  await writeFile(
    path.join(projectRoot, ".tools/phase4-forms-results.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await Promise.all(servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
  await db.disconnect();
  await peer.disconnect();
}
