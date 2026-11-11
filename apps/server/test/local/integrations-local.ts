import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { createDatabase } from "@Alumni-Tracking-Ss/db";
import { migrateDatabase } from "@Alumni-Tracking-Ss/db/migration";
import { seedDatabase } from "@Alumni-Tracking-Ss/db/seed-data";
import { createApp } from "../../src/app";
import { adminCookie } from "./local-admin";

// Integration credentials on a real replica set: enable/update/disable through HTTP, then scan
// every document of every collection for the encryption key and the plaintext secrets.
if (process.env.NODE_ENV === "production") throw new Error("Synthetic local acceptance only.");
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = `mongodb://127.0.0.1:27018/collab_integrations_${randomBytes(8).toString("hex")}?replicaSet=rs0`;
process.env.SEED_ADMIN_EMAIL = "synthetic-admin@example.test";
process.env.SEED_ADMIN_PASSWORD = randomBytes(24).toString("base64url");
process.env.SEED_DEMO_DATA = "false";
delete process.env.STAFF_EMAIL_DOMAINS;
// The seed must not copy anything from this shell's environment.
delete process.env.INTEGRATION_ENCRYPTION_KEY;

const keyHex = randomBytes(32).toString("hex");
const secrets = {
  recaptcha: `recaptcha-secret-${randomBytes(6).toString("hex")}`,
  email: `gateway-key-${randomBytes(6).toString("hex")}`,
};
const db = createDatabase({ DATABASE_URL: process.env.DATABASE_URL });
const origin = "http://localhost:3001";
try {
  assert.deepEqual((await migrateDatabase(db, "apply")).conflicts, []);
  await seedDatabase(db);
  const app = createApp({
    db,
    config: { nodeEnv: "test", origin },
    integrationEnv: {
      integrationEncryptionKey: keyHex,
      appUrl: "http://localhost:3000",
      connectionTester: async () => undefined,
    },
  });
  const cookie = await adminCookie(db);
  const send = (method: "post" | "put", url: string, body: object) =>
    request(app)[method](url).set("Cookie", cookie).set("Origin", origin).send(body);

  const responses: string[] = [];
  const track = (response: request.Response) => {
    if (response.status >= 400) console.error(response.status, response.body);
    responses.push(JSON.stringify(response.body));
    return response;
  };
  assert.equal(
    track(
      await send("post", "/api/integrations/recaptcha/enable", {
        credentials: { siteKey: "public-site-key", secretKey: secrets.recaptcha },
      }),
    ).status,
    201,
  );
  assert.equal(
    track(
      await send("post", "/api/integrations/email/enable", {
        credentials: {
          gatewayUrl: "https://mail.example.test/send",
          fromAddress: "alumni@example.test",
          apiKey: secrets.email,
        },
      }),
    ).status,
    201,
  );
  assert.equal(
    track(
      await send("put", "/api/integrations/email/credentials", {
        credentials: { fromAddress: "office@example.test", apiKey: "" },
      }),
    ).status,
    200,
  );
  const forms = track(
    await send("post", "/api/integrations/google_forms/enable", { credentials: {} }),
  );
  assert.equal(forms.status, 201);
  const webhookSecret = forms.body.webhookSecret as string;
  assert.match(webhookSecret, /^[a-f0-9]{64}$/);
  responses.pop(); // the one response allowed to carry the generated secret
  track(await request(app).get("/api/integrations").set("Cookie", cookie));
  track(await request(app).get("/api/auth/config"));
  track(await request(app).get("/api/audit?page=1&pageSize=100").set("Cookie", cookie));
  for (const value of [...Object.values(secrets), webhookSecret])
    assert.ok(!responses.join("\n").includes(value), "a response contained a stored secret");

  const native = db.connection.db!;
  const scan = async () => {
    const dump: string[] = [];
    for (const { name } of await native.listCollections({}, { nameOnly: true }).toArray())
      dump.push(JSON.stringify(await native.collection(name).find({}).toArray()));
    return dump.join("\n");
  };
  let stored = await scan();
  for (const material of [
    keyHex,
    keyHex.toUpperCase(),
    Buffer.from(keyHex, "hex").toString("base64"),
  ])
    assert.ok(!stored.includes(material), "INTEGRATION_ENCRYPTION_KEY appeared in a document");
  for (const value of [...Object.values(secrets), webhookSecret])
    assert.ok(!stored.includes(value), "a plaintext secret appeared in a document");

  assert.equal((await send("post", "/api/integrations/recaptcha/disable", {})).status, 200);
  const row = await db.IntegrationSetting.findOne({ key: "recaptcha" }).lean().orFail();
  assert.equal(row.enabled, false);
  assert.equal(row.credentials, undefined);
  assert.equal(row.keyFingerprint, undefined);
  stored = await scan();
  assert.ok(!stored.includes(keyHex));
  console.log(
    "PASS integrations: encrypted enable/update/disable over HTTP, no secret in any response, no key or plaintext secret in any document, disable erases credentials.",
  );
} finally {
  await db.connection.dropDatabase().catch(() => undefined);
  await db.disconnect();
}
