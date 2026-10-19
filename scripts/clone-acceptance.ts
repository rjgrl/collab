import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { generate } from "otplib";
import { createPrismaClient } from "../packages/db/src/index";
import { projectRoot, runTsx } from "./local-tools.mjs";
import { readLocalConfig } from "./local-env.mjs";

if (
  process.env.PHASE6_CLONE_REHEARSAL !== "true" ||
  !/phase6-clone-[a-f0-9-]+[\\/]?$/.test(projectRoot)
)
  throw Error("Run only through pnpm test:clone-local in its newly created synthetic clone.");
const { effective } = await readLocalConfig(projectRoot);
assert.ok(effective.DATABASE_URL);
assert.ok(effective.SEED_ADMIN_EMAIL);
assert.ok(effective.SEED_ADMIN_PASSWORD);
assert.match(new URL(effective.DATABASE_URL).pathname, /^\/collab_dev_[a-f0-9]{12}$/);
const db = createPrismaClient({ DATABASE_URL: effective.DATABASE_URL });
const processes: ReturnType<typeof spawn>[] = [];
async function free(port: number) {
  const server = net.createServer();
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
async function snapshot() {
  const names = await db.$runCommandRaw({ listCollections: 1, nameOnly: true });
  const all: Record<string, unknown> = {};
  for (const { name } of (names.cursor as { firstBatch: { name: string }[] }).firstBatch.sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const rows = await db.$runCommandRaw({
      find: name,
      sort: { _id: 1 },
      limit: 500,
      singleBatch: true,
    });
    const indexes = await db.$runCommandRaw({ listIndexes: name });
    all[name] = {
      documents: (rows.cursor as { firstBatch: unknown[] }).firstBatch,
      indexes: (indexes.cursor as { firstBatch: unknown[] }).firstBatch,
    };
  }
  return createHash("sha256").update(JSON.stringify(all)).digest("hex");
}
async function waitReady(url: string) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* own server still starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw Error("Owned application did not become ready.");
}
try {
  assert.equal(await db.alumni.count(), 3);
  assert.equal(await db.user.count(), 1);
  const before = await snapshot();
  const privateFiles = [
    "apps/server/.env",
    "apps/web/.env",
    "packages/db/.env",
    ".tools/local-login.txt",
  ];
  const hashes = await Promise.all(
    privateFiles.map(async (file) =>
      createHash("sha256")
        .update(await readFile(path.join(projectRoot, file)))
        .digest("hex"),
    ),
  );
  const env = { ...process.env, ...effective, NODE_ENV: "development" };
  // Existing database rerun excludes client generation to avoid concurrently
  // replacing this process's loaded Windows engine; exercise the exact DB steps.
  await runTsx("initialize-local-db.ts", { env });
  await runTsx("verify-local-setup.ts", { env });
  assert.equal(await snapshot(), before, "repeat setup must preserve documents and indexes");
  assert.deepEqual(
    await Promise.all(
      privateFiles.map(async (file) =>
        createHash("sha256")
          .update(await readFile(path.join(projectRoot, file)))
          .digest("hex"),
      ),
    ),
    hashes,
  );
  await free(3200);
  await free(3201);
  for (const [cwd, args] of [
    ["apps/server", ["dist/index.mjs"]],
    [
      "apps/web",
      [
        path.join(projectRoot, "node_modules/vite-plus/bin/vp"),
        "dev",
        "--host",
        "127.0.0.1",
        "--port",
        "3201",
        "--strictPort",
      ],
    ],
  ] as const) {
    const child = spawn(process.execPath, [...args], {
      cwd: path.join(projectRoot, cwd),
      env: { ...env, PORT: "3200", HOST: "127.0.0.1", API_PROXY_TARGET: "http://127.0.0.1:3200" },
      windowsHide: true,
      stdio: "ignore",
    });
    processes.push(child);
  }
  await waitReady("http://127.0.0.1:3200/health/ready");
  await waitReady("http://127.0.0.1:3201/login");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:3201/login");
    await page.locator("#email").fill(effective.SEED_ADMIN_EMAIL);
    await page.locator("#password").fill(effective.SEED_ADMIN_PASSWORD);
    const captcha = page.getByRole("checkbox");
    if (await captcha.count()) await captcha.first().check();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/security");
    const denied = await page.request.post("http://127.0.0.1:3201/rpc/dashboard/summary", {
      headers: { Origin: "http://127.0.0.1:3201" },
      data: { json: {} },
    });
    assert.equal(denied.status(), 403);
    await page.locator("#mfa-password").fill(effective.SEED_ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Set up authenticator", exact: true }).click();
    const secret = (await page.getByLabel("Authenticator setup key").textContent())!.trim();
    await page.locator("#mfa-code").fill(await generate({ secret }));
    await page.getByRole("button", { name: "Confirm authenticator", exact: true }).click();
    await page.getByLabel("I saved my recovery codes privately").check();
    await page.getByRole("button", { name: "Continue to application", exact: true }).click();
    await page.waitForURL("**/dashboard");
    for (const route of ["alumni", "departments", "programs", "settings"]) {
      await page.goto("http://127.0.0.1:3201/" + route);
      await expect(page).toHaveURL(new RegExp("/" + route + "$"));
      await expect(page.getByRole("main")).toBeVisible();
    }
    console.log(
      "PASS real committed-clone app: synthetic admin login, pre-MFA backend denial, TOTP enrollment, dashboard and core page navigation. No providers contacted.",
    );
  } finally {
    await browser.close();
  }
  console.log(
    "PASS existing-database setup steps preserve document/index snapshots and all private file hashes.",
  );
} finally {
  for (const child of processes)
    if (child.exitCode === null && child.pid) {
      // Terminate only a child created here. vp may own a worker on Windows.
      if (process.platform === "win32")
        await new Promise<void>((resolve) => {
          const stop = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            windowsHide: true,
            stdio: "ignore",
          });
          stop.once("exit", () => resolve());
          stop.once("error", () => resolve());
        });
      else child.kill("SIGTERM");
    }
  await db.$disconnect();
}
