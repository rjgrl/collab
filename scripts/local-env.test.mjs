import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtemp, readFile, writeFile, mkdir, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";
import { isManagedLocalDatabase, LOCAL_DATABASE_URL, prepareLocalEnv } from "./local-env.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "collab-local-env-"));
  t.after(async () => {
    for (const file of [
      "apps/server/.env",
      "apps/web/.env",
      "packages/db/.env",
      ".tools/local-login.txt",
    ])
      await unlink(path.join(root, file)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    for (const directory of [
      "apps/server",
      "apps/web",
      "apps",
      "packages/db",
      "packages",
      ".tools",
      ".",
    ])
      await rmdir(path.resolve(root, directory)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
  });
  return root;
}

it("creates complete local config and unique private bootstrap credentials once", async (t) => {
  const root = await fixture(t);
  const first = await prepareLocalEnv(root, { inherited: {} });
  const server = parseEnv(await readFile(path.join(root, "apps/server/.env"), "utf8"));
  assert.equal(server.DATABASE_URL, LOCAL_DATABASE_URL);
  assert.equal(server.CORS_ORIGIN, "http://localhost:3001");
  assert.ok(first.password.length >= 24);
  const second = await prepareLocalEnv(root, { inherited: {} });
  assert.equal(first.password, second.password);
  assert.equal(first.email, second.email);
  const otherRoot = await fixture(t);
  assert.notEqual((await prepareLocalEnv(otherRoot, { inherited: {} })).password, first.password);
});

it("preserves existing environment values, comments, and bootstrap password on a pull/setup rerun", async (t) => {
  const root = await fixture(t);
  await mkdir(path.join(root, "apps/server"), { recursive: true });
  await writeFile(
    path.join(root, "apps/server/.env"),
    `# team config\nDATABASE_URL=${LOCAL_DATABASE_URL}\nUPLOAD_DIR=./my-private-files\n`,
  );
  const first = await prepareLocalEnv(root, { inherited: {} });
  await prepareLocalEnv(root, { inherited: {}, demo: true });
  const text = await readFile(path.join(root, "apps/server/.env"), "utf8");
  assert.match(text, /# team config/);
  assert.equal(parseEnv(text).UPLOAD_DIR, "./my-private-files");
  assert.equal(
    parseEnv(await readFile(path.join(root, "packages/db/.env"), "utf8")).SEED_ADMIN_PASSWORD,
    first.password,
  );
});

it("refuses production and custom database URLs before writing local files", async (t) => {
  const root = await fixture(t);
  await assert.rejects(
    () => prepareLocalEnv(root, { inherited: { NODE_ENV: "production" } }),
    /refuses production/,
  );
  await assert.rejects(
    () =>
      prepareLocalEnv(root, { inherited: { DATABASE_URL: "mongodb://127.0.0.1:27017/shared" } }),
    /preserved/,
  );
  await assert.rejects(() => readFile(path.join(root, "apps/server/.env")), { code: "ENOENT" });
});

it("does not adopt arbitrary servers, authenticated URLs, or direct-connection bypasses", () => {
  assert.equal(isManagedLocalDatabase(LOCAL_DATABASE_URL), true);
  assert.equal(isManagedLocalDatabase("mongodb://127.0.0.1:27018/test?replicaSet=other"), false);
  assert.equal(
    isManagedLocalDatabase("mongodb://127.0.0.1:27018/test?replicaSet=rs0&directConnection=true"),
    false,
  );
  assert.equal(isManagedLocalDatabase("mongodb://example.test:27018/test?replicaSet=rs0"), false);
});

it("refuses inconsistent server/DB targets and preserves a production web configuration", async (t) => {
  const root = await fixture(t);
  await mkdir(path.join(root, "apps/server"), { recursive: true });
  await mkdir(path.join(root, "packages/db"), { recursive: true });
  await writeFile(path.join(root, "apps/server/.env"), `DATABASE_URL=${LOCAL_DATABASE_URL}\n`);
  await writeFile(
    path.join(root, "packages/db/.env"),
    "DATABASE_URL=mongodb://127.0.0.1:27018/other?replicaSet=rs0\n",
  );
  await assert.rejects(() => prepareLocalEnv(root, { inherited: {} }), /different databases/);
  await writeFile(path.join(root, "packages/db/.env"), "");
  await mkdir(path.join(root, "apps/web"), { recursive: true });
  await writeFile(path.join(root, "apps/web/.env"), "NODE_ENV=production\n");
  await assert.rejects(() => prepareLocalEnv(root, { inherited: {} }), /refuses production/);
});
