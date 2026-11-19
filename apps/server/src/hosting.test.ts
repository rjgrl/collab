import assert from "node:assert/strict";
import { it, type TestContext } from "node:test";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { query } from "../../../packages/api/src/test-utils/model-test-fixture";
import { createApp } from "./app";
import { databaseHealthy } from "./health";
import { listenerOptions } from "./runtime-config";
import { validateWebStorage, webHandler } from "./web-serving";

const origin = "https://app.example.test";
function fixture(webRoot?: string, production = false) {
  const db = {
    ready: async () => {},
    connection: {
      readyState: 1,
      db: { command: async () => ({ isWritablePrimary: true, setName: "rs0" }) },
    },
    IntegrationSetting: { findOne: () => query(() => null), find: () => query(() => []) },
    BackupState: { findById: () => query(() => null) },
  } as unknown as Database;
  return createApp({
    db,
    webRoot,
    config: { nodeEnv: production ? "production" : "test", origin },
    integrationEnv: {},
    sessionLoader: async () => null,
  });
}
async function files(t: TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), "collab-hosting-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const web = path.join(root, "web");
  await mkdir(path.join(web, "assets"), { recursive: true });
  await mkdir(path.join(web, "uploads"));
  await mkdir(path.join(web, "backups"));
  await mkdir(path.join(web, "api"));
  await writeFile(path.join(web, "index.html"), "<!doctype html><title>SYNTHETIC_SPA</title>");
  await writeFile(path.join(web, "assets", "app.js"), "console.log('SYNTHETIC_ASSET');");
  await writeFile(path.join(web, ".env"), "SYNTHETIC_PRIVATE_VALUE");
  await writeFile(path.join(web, "uploads", "private.txt"), "SYNTHETIC_PRIVATE_VALUE");
  await writeFile(path.join(web, "backups", "private.zip"), "SYNTHETIC_PRIVATE_VALUE");
  await writeFile(path.join(web, "api", "alumni"), "SYNTHETIC_FAKE_API");
  return { root, web };
}

it("uses the cloud port with a 5000 fallback and requires deliberate public binding", () => {
  assert.deepEqual(listenerOptions({}), { port: 5000, host: "127.0.0.1" });
  assert.deepEqual(listenerOptions({ PORT: "10000", HOST: "0.0.0.0" }), {
    port: 10000,
    host: "0.0.0.0",
  });
  for (const PORT of ["0", "-1", "65536", "5000.5", "5e3", "invalid"])
    assert.throws(() => listenerOptions({ PORT }), /PORT/);
});

it("separates connectivity health from the strict production readiness gate", async () => {
  const app = fixture(undefined, true);
  const healthy = await request(app).get("/health");
  assert.equal(healthy.status, 200);
  assert.deepEqual(healthy.body, { ok: true, checks: { server: true, database: true } });
  assert.equal((await request(app).get("/health/live")).status, 200);
  assert.equal((await request(app).get("/health/ready")).status, 503);
});

it("health refuses disconnected/standalone/secondary databases and bounds a stalled probe", async () => {
  for (const hello of [{ isWritablePrimary: false, setName: "rs0" }, { isWritablePrimary: true }]) {
    const db = {
      ready: async () => {},
      connection: { readyState: 1, db: { command: async () => hello } },
    } as unknown as Database;
    assert.equal(await databaseHealthy(db), false);
  }
  const disconnected = {
    ready: async () => {
      throw new Error("Must not wait for reconnection");
    },
    connection: { readyState: 0 },
  } as unknown as Database;
  assert.equal(await databaseHealthy(disconnected), false);
  const stalled = {
    ready: async () => {},
    connection: { readyState: 1, db: { command: () => new Promise(() => {}) } },
  } as unknown as Database;
  assert.equal(await databaseHealthy(stalled, 5), false);
});

it("serves compiled assets and SPA deep links without replacing API/auth boundaries", async (t) => {
  const { web } = await files(t);
  const app = fixture(web);
  for (const route of ["/", "/my-profile", "/settings/users", "/settings/backups"])
    assert.match(
      (await request(app).get(route).set("Accept", "text/html").expect(200)).text,
      /SYNTHETIC_SPA/,
    );
  assert.match((await request(app).get("/assets/app.js").expect(200)).text, /SYNTHETIC_ASSET/);
  const denied = await request(app).get("/api/v1/alumni").set("Accept", "text/html");
  assert.equal(denied.status, 401);
  assert.ok(!denied.text.includes("SYNTHETIC_FAKE_API"));
  for (const route of [
    "/api/unknown",
    "/rpc",
    "/api-reference",
    "/uploads/private.txt",
    "/backups/private.zip",
    "/.env",
    "/assets/missing.js",
  ])
    assert.equal((await request(app).get(route).set("Accept", "text/html")).status, 404, route);
  const csp = String((await request(app).get("/")).headers["content-security-policy"]);
  assert.ok(csp.includes("https://www.google.com/recaptcha/"));
  assert.ok(csp.includes("blob:"));
  assert.ok(!csp.includes("unsafe-eval"));
});

it("allows only the configured CORS origin and preserves anonymous mutation denial", async () => {
  const app = fixture();
  const preflight = await request(app)
    .options("/api/v1/alumni")
    .set("Origin", origin)
    .set("Access-Control-Request-Method", "POST")
    .set("Access-Control-Request-Headers", "content-type");
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers["access-control-allow-origin"], origin);
  assert.equal(preflight.headers["access-control-allow-credentials"], "true");
  assert.equal(
    (await request(app).get("/health/live").set("Origin", "https://other.example.test")).headers[
      "access-control-allow-origin"
    ],
    undefined,
  );
  assert.equal(
    (await request(app).post("/api/v1/alumni").set("Origin", "https://other.example.test").send({}))
      .status,
    403,
  );
  assert.equal(
    (await request(app).post("/api/v1/alumni").set("Origin", origin).send({})).status,
    401,
  );
});

it("refuses missing builds, public storage overlap and symlinked web assets", async (t) => {
  const { root, web } = await files(t);
  assert.throws(() => webHandler(path.join(root, "missing")), /pnpm build/);
  assert.throws(() => validateWebStorage(web, path.join(web, "uploads")), /UPLOAD_DIR/);
  assert.throws(() => validateWebStorage(web, root), /UPLOAD_DIR/);
  assert.throws(() => validateWebStorage(web, path.join(web, "..private")), /UPLOAD_DIR/);
  assert.throws(
    () =>
      validateWebStorage(web, path.join(root, "private"), path.join(root, "private", "..backups")),
    /BACKUP_DIR/,
  );
  assert.throws(
    () => validateWebStorage(web, path.join(root, "private"), path.join(web, "backups")),
    /BACKUP_DIR/,
  );
  validateWebStorage(web, path.join(root, "private"), path.join(root, "backups"));
  const alias = path.join(root, "alias");
  await symlink(web, alias, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => validateWebStorage(web, alias), /UPLOAD_DIR/);
  const outside = path.join(root, "outside");
  await mkdir(outside);
  await symlink(
    outside,
    path.join(web, "linked"),
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.throws(() => webHandler(web), /Built frontend/);
});
