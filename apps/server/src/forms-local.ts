import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { serve } from "@hono/node-server";
import { generate } from "otplib";
import { createApp } from "./app";
import { createPrismaClient, hashPassword } from "../../../packages/db/src/index";
import type { Database } from "../../../packages/db/src/index";
import { PERMISSIONS, ROLE_PRESETS } from "../../../packages/db/src/permissions";
import { createSession } from "../../../packages/api/src/services/session";
import { projectRoot, runTool } from "../../../scripts/local-tools.mjs";
import { isManagedLocalDatabase } from "../../../scripts/local-env.mjs";
if (process.env.NODE_ENV === "production") throw Error("Local tests only");
process.env.NODE_ENV = "test";
process.env.PASSWORD_BREACH_CHECK = "local";
const name = `collab_forms_${randomBytes(6).toString("hex")}`;
const url = `mongodb://127.0.0.1:27018/${name}?replicaSet=rs0`;
assert.ok(isManagedLocalDatabase(url));
await runTool(
  "prisma",
  "prisma",
  [
    "db",
    "push",
    "--skip-generate",
    "--schema",
    path.join(projectRoot, "packages/db/prisma/schema"),
  ],
  {
    cwd: path.join(projectRoot, "packages/db"),
    toolRoot: path.join(projectRoot, "packages/db"),
    env: { ...process.env, DATABASE_URL: url },
  },
);
const db = createPrismaClient({ DATABASE_URL: url });
const peer = createPrismaClient({ DATABASE_URL: url });
const secret = "synthetic-forms-secret-only";
const faultDb = {
  ...db,
  $transaction: async (work: Parameters<Database["$transaction"]>[0]) =>
    db.$transaction(async (tx) => {
      // Inject a failure after the alumni/tracking writes but before job completion.
      const faulty = {
        ...tx,
        importJob: {
          ...tx.importJob,
          create: async () => {
            throw Error("SYNTHETIC_PRIVATE_DATABASE_FAILURE");
          },
        },
      };
      return (work as (tx: unknown) => Promise<unknown>)(faulty);
    }),
} as unknown as Database;
const servers: ReturnType<typeof serve>[] = [];
const config = { nodeEnv: "test", origin: "http://localhost:3001" };
const integrationEnv = { googleFormsWebhookSecret: secret, mfaEncryptionKey: "47".repeat(32) };
async function listen(database: Database, env = integrationEnv) {
  const app = createApp({ db: database, config, integrationEnv: env });
  const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 });
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
  firstName: "Synthetic",
  lastName: "Forms",
  gender: "Female",
  departmentCode: "TEST",
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
  await db.integrationSetting.create({ data: { key: "google_forms", enabled: false } });
  const base = await listen(db),
    second = await listen(peer),
    fault = await listen(faultDb);
  await expected("disabled integration", base, "synthetic-response-001", 403);
  // Enable only this newly created disposable database, never application settings.
  await db.integrationSetting.update({ where: { key: "google_forms" }, data: { enabled: true } });
  await expected("wrong shared secret", base, "synthetic-response-001", 401, payload, "wrong");
  const unconfigured = await listen(db, { ...integrationEnv, googleFormsWebhookSecret: "" });
  await expected("unconfigured secret", unconfigured, "synthetic-response-001", 401);
  await expected("missing key", base, undefined, 400);
  await expected("invalid payload", base, "synthetic-invalid-001", 400, { ...payload, gender: "" });
  await expected("domain error rollback", base, "synthetic-domain-001", 400);
  assert.equal(await db.formsReceipt.count(), 0);
  assert.equal(await db.importJob.count(), 0);
  assert.equal(await db.alumni.count(), 0);
  const department = await db.department.create({ data: { code: "TEST", name: "Synthetic" } });
  await db.program.create({
    data: { code: "TEST", name: "Synthetic", departmentId: department.id },
  });
  const first = await expected("first commit", base, "synthetic-response-001", 200);
  const saved = await db.alumni.findUniqueOrThrow({
    where: { studentNumber: payload.studentNumber },
  });
  const retry = await expected(
    "serial duplicate another instance",
    second,
    "synthetic-response-001",
    200,
  );
  assert.equal(retry.body.replayed, true);
  assert.equal(retry.body.importJobId, first.body.importJobId);
  assert.equal(
    (await db.alumni.findUniqueOrThrow({ where: { id: saved.id } })).lastTrackedAt?.getTime(),
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
  assert.equal(await db.alumni.count(), 2);
  assert.equal(await db.trackingEvent.count(), 2);
  assert.equal(await db.formsReceipt.count(), 2);
  assert.equal(await db.importJob.count(), 2);
  const failedPayload = { ...payload, studentNumber: "FORM-FAULT" };
  const failed = await expected(
    "injected partial failure",
    fault,
    "synthetic-fault-001",
    500,
    failedPayload,
  );
  assert.ok(!JSON.stringify(failed.body).includes("SYNTHETIC_PRIVATE"));
  assert.equal(
    await db.alumni.findUnique({ where: { studentNumber: failedPayload.studentNumber } }),
    null,
  );
  assert.equal(await db.formsReceipt.count(), 2);
  assert.equal(await db.importJob.count(), 2);
  assert.equal(await db.trackingEvent.count(), 2);
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
  assert.equal(await db.alumni.count(), 4);
  assert.equal(await db.trackingEvent.count(), 4);
  assert.equal(await db.formsReceipt.count(), 5);
  assert.equal(await db.importJob.count(), 5);
  checks.push({ test: "distinct response IDs same student: one alumni record", status: 200 });
  const archived = await db.alumni.findUniqueOrThrow({
    where: { studentNumber: sameStudent.studentNumber },
  });
  await db.alumni.update({ where: { id: archived.id }, data: { deletedAt: new Date() } });
  await expected(
    "archived alumni cannot be changed",
    base,
    "synthetic-archived-001",
    400,
    sameStudent,
  );
  assert.equal(await db.formsReceipt.count(), 5);
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
  assert.equal(
    (await db.alumni.findUniqueOrThrow({ where: { id: saved.id } })).firstName,
    "Newer synthetic",
  );
  assert.equal(await db.formsReceipt.count(), 6);
  assert.equal(await db.importJob.count(), 6);
  const receipt = await db.formsReceipt.findFirstOrThrow();
  assert.ok(!JSON.stringify(receipt).includes("Synthetic"));
  // Seed the exact default presets. No private/live role assignments are read.
  const perms = await Promise.all(PERMISSIONS.map((p) => db.permission.create({ data: p })));
  const password = "Synthetic role verification passphrase 872!";
  const passwordHash = await hashPassword(password);
  async function rpc(route: string, token: string, input: unknown = {}) {
    const r = await fetch(base + "/rpc/" + route, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ json: input }),
    });
    return { status: r.status, body: ((await r.json()) as { json: Record<string, unknown> }).json };
  }
  const users: Record<string, { id: string; token: string }> = {};
  for (const preset of Object.values(ROLE_PRESETS)) {
    const user = await db.user.create({
      data: {
        name: preset.name,
        email: `${preset.key}@example.test`,
        passwordHash,
        emailVerified: true,
        userRoles: {
          create: {
            role: {
              create: {
                key: preset.key,
                name: preset.name,
                rolePermissions: {
                  create: perms
                    .filter((p) => (preset.permissions as readonly string[]).includes(p.key))
                    .map((p) => ({ permissionId: p.id })),
                },
              },
            },
          },
        },
      },
    });
    let token = (await createSession(db, user.id, {})).token;
    if (preset.key !== "viewer") {
      assert.equal((await rpc("alumni/list", token)).status, 403);
      const setup = await rpc("auth/beginMfa", token, { password });
      assert.equal(setup.status, 200);
      const confirmation = await rpc("auth/confirmMfa", token, {
        code: await generate({ secret: String(setup.body.secret) }),
      });
      assert.equal(confirmation.status, 200);
      token = String(confirmation.body.sessionToken);
    }
    users[preset.key] = { id: user.id, token };
  }
  for (const [role, route, status] of [
    ["viewer", "users/list", 403],
    ["viewer", "reports/alumniCsv", 403],
    ["staff", "users/list", 403],
    ["staff", "reports/alumniCsv", 200],
    ["super_admin", "users/list", 200],
  ] as const) {
    assert.equal((await rpc(route, users[role]!.token)).status, status);
    checks.push({ test: `${role}: ${route}`, status });
  }
  const globalRead = await rpc("alumni/get", users.viewer!.token, { id: saved.id });
  assert.equal(globalRead.status, 200);
  checks.push({ test: "viewer global alumni read is current permission policy", status: 200 });
  assert.equal((await rpc("alumni/delete", users.viewer!.token, { id: saved.id })).status, 403);
  assert.equal(
    (
      await rpc("auth/updateProfile", users.viewer!.token, {
        name: "Own synthetic profile",
        userId: users.super_admin!.id,
      })
    ).status,
    200,
  );
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: users.super_admin!.id } })).name,
    "Super Admin",
  );
  checks.push({ test: "profile userId manipulation changes only the caller", status: 200 });
  await db.integrationSetting.update({ where: { key: "google_forms" }, data: { enabled: false } });
  await expected("disabled even on known replay", base, "synthetic-response-001", 403);
  const result = {
    date: new Date().toISOString(),
    database: name,
    checks,
    concurrentStatuses: concurrent.map((x) => x.status),
    counts: {
      alumni: await db.alumni.count(),
      tracking: await db.trackingEvent.count(),
      receipts: await db.formsReceipt.count(),
      jobs: await db.importJob.count(),
    },
    formsEnabledAtEnd: false,
    limits: [
      "only synthetic loopback data",
      "same-key atomic DB effects, no provider exactly-once claim",
      "custom roles use union of explicit permissions; institution scope unchanged",
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
  await db.$disconnect();
  await peer.$disconnect();
}
