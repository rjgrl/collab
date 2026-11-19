import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, copyFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../packages/db/src/index";

if (process.env.NODE_ENV === "production") throw new Error("This check is native-local only.");
if (process.platform === "win32" && process.versions.node === "24.15.0")
  throw new Error(
    "Windows Node 24.15.0 can abort during Varlock startup. Run this check with the pinned Node 26.10.0; see docs/operations/RENDER_DEPLOYMENT.md.",
  );
const entry = path.resolve("apps/server/dist/index.mjs");
assert.ok(existsSync(entry) && existsSync("apps/web/dist/index.html"), "Run pnpm build first.");
const name = `collab_hosting_smoke_${randomUUID().replaceAll("-", "")}`;
const uri = `mongodb://127.0.0.1:27018/${name}?replicaSet=rs0`;
const db = createDatabase({ MONGO_URI: uri });
let child: ReturnType<typeof spawn> | undefined;
let closed: Promise<void> | undefined;
let temp: string | undefined;
let output = "";
let spawnFailed = false;
let stage = "native database";
try {
  await db.ready();
  assert.equal(db.connection.name, name);
  const college = await db.College.create({
    name: "Synthetic hosted college",
    description: "Artifact check",
  });
  const department = await db.Department.create({
    name: "Synthetic hosted department",
    description: "Artifact check",
    collegeId: college._id,
  });
  const program = await db.Program.create({
    name: "Synthetic hosted program",
    description: "Artifact check",
    code: "HOSTED_SMOKE",
    departmentId: department._id,
  });
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const address = reservation.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  const origin = `http://127.0.0.1:${port}`;
  temp = await mkdtemp(path.join(tmpdir(), "collab-hosted-artifacts-"));
  await copyFile("apps/server/.env.schema", path.join(temp, ".env.schema"));
  const uploads = path.join(temp, "uploads");
  await mkdir(uploads);
  stage = "compiled startup";
  child = spawn(process.execPath, [entry], {
    cwd: temp,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      _VARLOCK_THROW_ON_LOAD_ERROR: "1",
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: String(port),
      SERVE_WEB: "true",
      MONGO_URI: uri,
      DATABASE_URL: "",
      APP_URL: origin,
      CORS_ORIGIN: origin,
      UPLOAD_DIR: uploads,
      BACKUP_DIR: "",
      BACKUP_ENCRYPTION_KEY: "",
      MONGODB_TOOLS_DIR: "",
      SESSION_SECRET: "synthetic-hosting-check-session-secret-123456789",
      MFA_ENCRYPTION_KEY: "12".repeat(32),
      INTEGRATION_ENCRYPTION_KEY: "13".repeat(32),
      LOCAL_DISABLE_MFA: "false",
      LOCAL_REQUIRE_EMAIL_VERIFICATION: "true",
      LOCAL_REQUIRE_PHONE_VERIFICATION: "true",
      ALLOW_PUBLIC_SIGNUP: "true",
      STAFF_EMAIL_DOMAINS: "example.test",
      AUTH_IP_STORE: "memory",
    },
  });
  child.once("error", () => {
    spawnFailed = true;
  });
  child.stdout?.on("data", (bytes: Buffer) => {
    output = (output + bytes.toString()).slice(-16000);
  });
  child.stderr?.on("data", (bytes: Buffer) => {
    output = (output + bytes.toString()).slice(-16000);
  });
  closed = new Promise<void>((resolve) => {
    child!.once("close", () => resolve());
  });
  const deadline = Date.now() + 30000;
  let ready = false;
  while (Date.now() < deadline) {
    if (spawnFailed || child.exitCode !== null || child.signalCode !== null) break;
    try {
      const response = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* The owned child may still be starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, "Compiled server did not become healthy with an isolated MONGO_URI.");
  stage = "compiled frontend";
  const index = await fetch(origin);
  assert.equal(index.status, 200);
  const html = await index.text();
  assert.ok(html.includes('id="app"') && !html.includes("/@vite/client"));
  const script = html.match(/<script[^>]+src="([^"]+)"/);
  assert.ok(script?.[1], "Built web entry must reference a script asset.");
  assert.equal((await fetch(new URL(script[1], origin))).status, 200);
  assert.equal((await fetch(`${origin}/my-profile`)).status, 200);
  assert.equal((await fetch(`${origin}/api/v1/alumni`)).status, 401);
  for (const route of ["/api/unknown", "/rpc", "/api-reference", "/.env", "/uploads/private.txt"])
    assert.equal((await fetch(origin + route)).status, 404, route);
  stage = "database marker";
  const programs = await (await fetch(`${origin}/api/v1/auth/registration-programs`)).json();
  assert.ok(
    JSON.stringify(programs).includes(String(program._id)),
    "Compiled API did not read the isolated MONGO_URI database.",
  );
  assert.equal(
    (await fetch(`${origin}/__test/reset`, { method: "POST", headers: { Origin: origin } })).status,
    404,
  );
  console.log(
    "PASS compiled Node entry, MONGO_URI-only native database selection, built SPA/assets/deep links, protected API boundaries and absent test controls. This is not production/provider acceptance.",
  );
} catch (error) {
  console.error(
    `Native compiled check failed at ${stage}: ${error instanceof Error ? error.message.replace(/mongodb(?:\+srv)?:\/\/\S+/g, "<database>") : "unexpected failure"}`,
  );
  if (output)
    console.error(
      JSON.stringify({
        childExitCode: child?.exitCode,
        reportedPort: output.match(/Server listening on port (\d+)/)?.[1] ?? null,
        moduleResolutionFailure: /ERR_MODULE_NOT_FOUND|Cannot find module|Cannot find package/.test(
          output,
        ),
        dynamicRequireFailure: /Dynamic require|require is not defined/.test(output),
        aliasConflict: /must be identical/.test(output),
        uriConfigurationFailure: /MONGO_URI|DATABASE_URL/.test(output),
        missingSchema: /schema/i.test(output),
        publicBuildFailure: /Built frontend|SERVE_WEB/.test(output),
        localPolicyFailure: /LOCAL_DISABLE_MFA|LOCAL_REQUIRE/.test(output),
      }),
    );
  const nativeDiagnostic = output
    .split(/\r?\n/)
    .filter((line) =>
      /Assertion|FATAL|Check failed|Native stack|JavaScript stack|v8::|\.cc:/.test(line),
    )
    .join("\n");
  if (nativeDiagnostic)
    console.error(
      nativeDiagnostic
        .replace(/mongodb(?:\+srv)?:\/\/\S+/g, "<database>")
        .replace(/\b[a-f0-9]{64}\b/gi, "<key>")
        .slice(0, 3000),
    );
  throw new Error("Hosted artifact smoke check failed; no Atlas database was used.");
} finally {
  if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  if (closed && child) {
    const force = setTimeout(() => {
      if (child!.exitCode === null && child!.signalCode === null) child!.kill("SIGKILL");
    }, 5000);
    await closed;
    clearTimeout(force);
  }
  try {
    if (db.connection.readyState === 1) {
      assert.equal(db.connection.name, name);
      assert.match(name, /^collab_hosting_smoke_[a-f0-9]{32}$/);
      await db.connection.dropDatabase();
    }
  } finally {
    await db.disconnect();
    if (temp) await rm(temp, { recursive: true, force: true });
  }
}
