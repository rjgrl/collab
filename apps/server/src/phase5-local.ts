import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generate } from "otplib";
import { createDatabase, hashPassword } from "../../../packages/db/src/index";
import { createApp } from "./app";
import { acceptanceRequest } from "./local-rest";
import { migrateDatabase } from "../../../packages/db/src/migration";
import { projectRoot } from "../../../scripts/local-tools.mjs";
import { isManagedLocalDatabase } from "../../../scripts/local-env.mjs";
if (process.env.NODE_ENV === "production") throw Error("Local synthetic checks only");
process.env.NODE_ENV = "test";
process.env.PASSWORD_BREACH_CHECK = "local";
process.env.AUTH_IP_STORE = "mongodb";
process.env.AUTH_IP_LIMIT = "1000";
const database = `collab_phase5_${randomBytes(6).toString("hex")}`;
const url = `mongodb://127.0.0.1:27018/${database}?replicaSet=rs0`;
assert.ok(isManagedLocalDatabase(url));
const db = createDatabase({ DATABASE_URL: url });
await db.ready();
assert.deepEqual((await migrateDatabase(db, "apply")).conflicts, []);
const servers: ReturnType<ReturnType<typeof createApp>["listen"]>[] = [];
const origin = "https://app.example.test";
const integrationEnv = {
  mfaEncryptionKey: "58".repeat(32),
  googleFormsWebhookSecret: "synthetic-phase5-webhook",
};
async function listen(production = false, trustedProxyIps: readonly string[] = []) {
  const app = createApp({
    db,
    config: { nodeEnv: production ? "production" : "test", origin, trustedProxyIps },
    integrationEnv,
  });
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  if (!server.listening) await once(server, "listening");
  const a = server.address();
  assert.ok(a && typeof a === "object");
  return `http://127.0.0.1:${a.port}`;
}
const checks: { test: string; status: number }[] = [];
const metrics: unknown[] = [];
try {
  await db.IntegrationSetting.insertMany([
    { key: "recaptcha", enabled: false },
    { key: "google_forms", enabled: true },
  ]);
  const department = await db.Department.create({ name: "Synthetic" });
  const program = await db.Program.create({
    code: "P5",
    name: "Synthetic",
    departmentId: department.id,
  });
  await db.Alumni.insertMany(
    Array.from({ length: 1000 }, (_, i) => ({
      studentNumber: `P5-${i}`,
      firstName: "Synthetic",
      lastName: `Person${String(i).padStart(4, "0")}`,
      gender: "Female",
      programId: program.id,
      isTracked: i % 2 === 0,
    })),
  );
  const password = "Synthetic production-like passphrase 919!";
  const keys = ["alumni.read", "dashboard.read", "reports.export", "files.read"];
  const role = await db.Role.create({ key: "super_admin", name: "Synthetic" });
  for (const key of keys) {
    const permission = await db.Permission.create({ key, name: key, module: "synthetic" });
    await db.RolePermission.create({ roleId: role._id, permissionId: permission._id });
  }
  const user = await db.User.create({
    name: "Synthetic Phase5",
    email: "phase5@example.test",
    emailVerified: true,
    passwordHash: await hashPassword(password),
  });
  await db.UserRole.create({ userId: user._id, roleId: role._id });
  const base = await listen();
  process.env.AUTH_IP_LIMIT = "2";
  const trusted = await listen(true, ["127.0.0.1"]),
    direct = await listen(true);
  async function malformed(target: string, forwarded?: string) {
    const r = await fetch(target + "/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(forwarded ? { "X-Forwarded-For": forwarded } : {}),
      },
      body: "{}",
    });
    await r.text();
    return r.status;
  }
  assert.deepEqual(
    [
      await malformed(trusted, "198.51.100.10"),
      await malformed(trusted, "198.51.100.10"),
      await malformed(trusted, "198.51.100.10"),
    ],
    [400, 400, 429],
  );
  assert.equal(await malformed(trusted, "198.51.100.11"), 400);
  checks.push({ test: "trusted proxy separates client budgets", status: 429 });
  assert.deepEqual(
    [
      await malformed(direct, "198.51.100.20"),
      await malformed(direct, "198.51.100.21"),
      await malformed(direct, "198.51.100.22"),
    ],
    [400, 400, 429],
  );
  checks.push({ test: "untrusted forwarding cannot reset peer budget", status: 429 });
  assert.deepEqual(
    [
      await malformed(trusted, "198.51.100.1, 198.51.100.2"),
      await malformed(trusted),
      await malformed(trusted, "invalid"),
    ],
    [400, 400, 429],
  );
  checks.push({ test: "malformed trusted forwarding shares unknown budget", status: 429 });
  const loginStart = performance.now();
  const login = await fetch(trusted + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.9" },
    body: JSON.stringify({ email: user.email, password }),
  });
  assert.equal(login.status, 200);
  await login.text();
  const cookie = login.headers.get("set-cookie")!;
  assert.match(cookie, /__Host-ats_session=/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.ok(!/Domain=/i.test(cookie));
  const cookieToken = cookie.match(/__Host-ats_session=([^;]+)/)![1]!;
  assert.equal((await db.Session.findOne({ userId: user.id }).orFail()).ipAddress, "198.51.100.9");
  metrics.push({
    workflow: "password login (cold, strong scrypt)",
    requests: 1,
    durationMs: performance.now() - loginStart,
  });
  checks.push({
    test: "production cookie and trusted audit IP over local HTTP simulation",
    status: 200,
  });
  let token = cookieToken;
  async function rest(route: string, input: unknown = {}) {
    const result = await acceptanceRequest(base, route, input, token);
    return { status: result.response.status, body: result.body };
  }
  assert.equal((await rest("alumni/list")).status, 403);
  const setup = await rest("auth/beginMfa", { password });
  assert.equal(setup.status, 200);
  const secret = (setup.body as { secret: string }).secret;
  const mfaStart = performance.now();
  const confirmation = await rest("auth/confirmMfa", { code: await generate({ secret }) });
  assert.equal(confirmation.status, 200);
  token = (confirmation.body as { sessionToken: string }).sessionToken;
  metrics.push({
    workflow: "MFA confirmation and session rotation",
    requests: 1,
    durationMs: performance.now() - mfaStart,
  });
  // Representative direct query-plan experiment, not a claim about Mongoose's
  // complete relation-lookup aggregate pipeline or a production index change.
  async function explain() {
    const result = await db.connection.db!.command({
      explain: {
        find: "Alumni",
        filter: { isTracked: true },
        sort: { lastName: 1, firstName: 1, _id: 1 },
        limit: 20,
      },
      verbosity: "executionStats",
    });
    return result.executionStats;
  }
  const before = await explain();
  await db.connection.db!.command({
    createIndexes: "Alumni",
    indexes: [
      { key: { isTracked: 1, lastName: 1, firstName: 1, _id: 1 }, name: "phase5_candidate_list" },
    ],
  });
  const after = await explain();
  const plans = {
    before,
    after,
    scope:
      "candidate index only in disposable DB; direct representative query, not full application query shape",
  };
  async function measure(workflow: string, route: string, input: unknown) {
    await rest(route, input);
    const cpu = process.cpuUsage(),
      rssStart = process.memoryUsage().rss,
      start = performance.now();
    const times: number[] = [];
    let next = 0,
      errors = 0;
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (next++ < 40) {
          const t = performance.now();
          const r = await rest(route, input);
          if (r.status !== 200) errors++;
          times.push(performance.now() - t);
        }
      }),
    );
    const elapsed = performance.now() - start;
    times.sort((a, b) => a - b);
    const used = process.cpuUsage(cpu);
    assert.equal(errors, 0, workflow);
    metrics.push({
      workflow,
      requests: times.length,
      concurrency: 4,
      elapsedMs: elapsed,
      rps: (times.length * 1000) / elapsed,
      p50: times[20],
      p95: times[38],
      p99: times[39],
      errors,
      rssStart,
      rssEnd: process.memoryUsage().rss,
      cpuMs: (used.user + used.system) / 1000,
    });
  }
  await measure("session validation", "auth/me", {});
  await measure("tracked alumni page", "alumni/list", { tracked: "tracked", pageSize: 20 });
  await measure("substring search", "alumni/list", { search: "Person009", pageSize: 20 });
  await measure("deep page 20", "alumni/list", { page: 20, pageSize: 20 });
  await measure("dashboard aggregate", "dashboard/summary", {});
  await measure("CSV 1000 rows", "reports/alumniCsv", {});
  const formsStart = performance.now();
  const formStatuses: number[] = [];
  for (let i = 0; i < 12; i++) {
    const response = await fetch(base + "/api/integrations/google-forms/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": integrationEnv.googleFormsWebhookSecret,
        "Idempotency-Key": `phase5-response-${String(i).padStart(3, "0")}`,
      },
      body: JSON.stringify({
        studentNumber: `P5-${i}`,
        firstName: "Synthetic",
        lastName: `Person${String(i).padStart(4, "0")}`,
        gender: "Female",
        departmentName: "Synthetic",
        programCode: "P5",
      }),
    });
    formStatuses.push(response.status);
    await response.text();
  }
  assert.ok(formStatuses.every((s) => s === 200));
  metrics.push({
    workflow: "12 sequential Forms commits",
    requests: 12,
    elapsedMs: performance.now() - formsStart,
    errors: 0,
  });
  await db.IntegrationSetting.findOneAndUpdate(
    { key: "google_forms" },
    { $set: { enabled: false } },
    { returnDocument: "after" },
  );
  // Explicit bounded export boundary check after the 1000-row measurements.
  for (let batch = 0; batch < 9; batch++)
    await db.Alumni.insertMany(
      Array.from({ length: 1000 }, (_, i) => ({
        studentNumber: `P5-LIMIT-${batch}-${i}`,
        firstName: "Boundary",
        lastName: "Synthetic",
        programId: program.id,
      })),
    );
  const atLimit = await rest("reports/alumniCsv", {});
  assert.equal(atLimit.status, 200);
  assert.equal((atLimit.body as { count: number }).count, 10000);
  await db.Alumni.create({
    studentNumber: "P5-OVER-LIMIT",
    firstName: "Boundary",
    lastName: "Synthetic",
    programId: program.id,
  });
  assert.equal((await rest("reports/alumniCsv", {})).status, 400);
  checks.push({ test: "CSV exactly 10000 allowed; 10001 rejected over TCP", status: 400 });
  await db.disconnect();
  const disconnected = await fetch(base + "/health/ready");
  assert.equal(disconnected.status, 503);
  await disconnected.text();
  await db.connection.openUri(url, { autoIndex: false, autoCreate: false });
  assert.equal((await rest("auth/me")).status, 200);
  checks.push({
    test: "closed Mongoose connection denies readiness; explicit reconnect restores operation",
    status: 200,
  });
  const readiness = await fetch(base + "/health/ready");
  assert.equal(readiness.status, 200);
  await readiness.text();
  const serverStatus = await db.connection.db!.command({ serverStatus: 1 });
  const result = {
    date: new Date().toISOString(),
    database,
    hardware: {
      node: process.version,
      platform: process.platform,
      cpu: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length,
      totalMemoryGiB: os.totalmem() / 1024 ** 3,
    },
    dataset: 1000,
    exportBoundaryDataset: 10001,
    workloadLimit:
      "240 concurrent measured reads/exports at concurrency 4, 12 sequential Forms commits, single login/MFA and limited proxy probes; no sustained stress",
    metrics,
    plans,
    checks,
    connections: serverStatus.connections,
    limits: [
      "same process client/server; no TLS handshake",
      "shared local MongoDB instance, connection counts include other local clients",
      "one short run; percentile samples small; no capacity or memory-leak inference",
      "candidate index remains only in disposable DB; application schema unchanged",
      "no actual Nginx/firewall or production signal/failover test",
    ],
  };
  await mkdir(path.join(projectRoot, ".tools"), { recursive: true });
  await writeFile(
    path.join(projectRoot, ".tools/phase5-performance.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await Promise.all(servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
  await db.disconnect();
}
