import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, it } from "node:test";
import { modelFixture } from "../test-utils/model-test-fixture";
import { storeCredentials } from "../integrations/credential-store";
import { copyToDrive, excludedFromBackup, type BackupConfig } from "./backup-service";

const integrationKeyHex = "4c".repeat(32);
const dir = await mkdtemp(path.join(tmpdir(), "ats-offhost-"));
after(() => rm(dir, { recursive: true, force: true }));
const file = path.join(dir, "20261109000000-0a1b2c3d.atsbak");
await writeFile(file, Buffer.from("ciphertext only"));
const config = {
  databaseUrl: "mongodb://127.0.0.1:27018/x",
  uploadDir: dir,
  appVersion: "test",
  integrationEncryptionKey: integrationKeyHex,
} satisfies BackupConfig;
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const serviceAccountJson = JSON.stringify({
  client_email: "drive@example.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
});

async function driveFixture(enabled: boolean) {
  const f = modelFixture({ IntegrationSetting: [] });
  await storeCredentials(f.db, {
    integration: "google_drive",
    values: { serviceAccountJson, folderId: "folder-123" },
    key: Buffer.from(integrationKeyHex, "hex"),
    enabled,
  });
  return f;
}

it("uploads the encrypted file to the Drive folder with a resumable session", async () => {
  const f = await driveFixture(true);
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("oauth2")) return Response.json({ access_token: "token-1" });
    if (String(url).includes("uploadType=resumable"))
      return new Response(null, {
        status: 200,
        headers: { Location: "https://upload.example/s1" },
      });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  assert.equal(await copyToDrive(f.db, config, file, "20261109000000-0a1b2c3d", fetcher), "copied");
  const session = calls.find((call) => call.url.includes("uploadType=resumable"))!;
  assert.deepEqual(JSON.parse(String(session.init!.body)), {
    name: "20261109000000-0a1b2c3d.atsbak",
    parents: ["folder-123"],
  });
  assert.equal(calls.at(-1)!.url, "https://upload.example/s1");
});

it("skips when Drive is disabled and reports a failed copy without throwing", async () => {
  const off = await driveFixture(false);
  assert.equal(await copyToDrive(off.db, config, file, "x", fetch), "skipped");
  const on = await driveFixture(true);
  const failing = (async () => new Response("no", { status: 500 })) as typeof fetch;
  assert.equal(await copyToDrive(on.db, config, file, "x", failing), "failed");
  assert.equal(
    await copyToDrive(
      on.db,
      { ...config, integrationEncryptionKey: "5d".repeat(32) },
      file,
      "x",
      failing,
    ),
    "failed",
  );
});

it("never puts env files, tool folders or key files into a backup", () => {
  for (const name of [
    ".env",
    ".env.local",
    ".ENV.production",
    ".tools",
    ".git",
    "node_modules",
    "server.key",
    "cert.pem",
  ])
    assert.equal(excludedFromBackup(name), true, name);
  for (const name of ["evidence.pdf", "photo.png", "environment-report.pdf"])
    assert.equal(excludedFromBackup(name), false, name);
});
