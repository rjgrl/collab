import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  seal,
  keyFingerprint as getKeyFingerprint,
  credentialAad,
} from "@Alumni-Tracking-Ss/db/secret-box";
import type { IntegrationEnv } from "../context";
import {
  eraseCredentials,
  integrationKey,
  invalidateIntegrationEnvCache,
  readStoredCredentials,
  resolveIntegrationEnv,
  storeCredentials,
  withoutIntegrationCredentials,
} from "./credential-store";
import { modelFixture } from "../test-utils/model-test-fixture";

describe("Credential Store", () => {
  const validKey = "34".repeat(32);
  const mismatchKey = "56".repeat(32);
  const invalidKey = "not-hex";

  describe("integrationKey", () => {
    it("parses a valid 64-hex-character key", () => {
      const key = integrationKey({ integrationEncryptionKey: validKey });
      assert.ok(key !== null);
      assert.equal(key?.length, 32); // 64 hex chars = 32 bytes
    });

    it("returns null for missing or invalid key", () => {
      assert.equal(integrationKey({}), null);
      assert.equal(integrationKey({ integrationEncryptionKey: invalidKey }), null);
      assert.equal(integrationKey({ integrationEncryptionKey: "" }), null);
    });
  });

  describe("readStoredCredentials", () => {
    const key = Buffer.from(validKey, "hex");

    it("returns 'none' when no credentials stored", async () => {
      const result = await readStoredCredentials({ key: "test", credentials: undefined }, key);
      assert.equal(result.status, "none");
      assert.deepEqual(result.values, {});
    });

    it("returns 'no_key' when key is missing", async () => {
      const result = await readStoredCredentials({ key: "test", credentials: { field: {} } }, null);
      assert.equal(result.status, "no_key");
      assert.deepEqual(result.values, {});
    });

    it("returns 'mismatch' when key fingerprint differs", async () => {
      const mismatch = Buffer.from(mismatchKey, "hex");
      const result = await readStoredCredentials(
        {
          key: "test",
          keyFingerprint: getKeyFingerprint(key),
          credentials: { field: {} },
        },
        mismatch,
      );
      assert.equal(result.status, "mismatch");
      assert.deepEqual(result.values, {});
    });

    it("returns 'ok' with decrypted values when credentials match key", async () => {
      const plaintext = "test-secret-value";
      const aad = credentialAad("google_auth", "clientSecret");
      const sealed = seal(key, aad, plaintext);

      const result = await readStoredCredentials(
        {
          key: "google_auth",
          keyFingerprint: getKeyFingerprint(key),
          credentials: { clientSecret: sealed },
        },
        key,
      );
      assert.equal(result.status, "ok");
      assert.equal(result.values.clientSecret, plaintext);
    });

    it("returns 'unreadable' when decryption fails (corrupted data)", async () => {
      const result = await readStoredCredentials(
        {
          key: "test",
          keyFingerprint: getKeyFingerprint(key),
          credentials: { field: { v: 1, iv: "invalid", tag: "invalid", data: "invalid" } },
        },
        key,
      );
      assert.equal(result.status, "unreadable");
      assert.deepEqual(result.values, {});
    });
  });

  describe("withoutIntegrationCredentials", () => {
    it("removes all integration credential fields", () => {
      const env: IntegrationEnv = {
        recaptchaSiteKey: "site",
        recaptchaSecretKey: "secret",
        googleClientId: "id",
        googleClientSecret: "secret",
        googleServiceAccountJson: '{"key": "value"}',
        googleDriveFolderId: "folder",
        googleSheetsSpreadsheetId: "sheet",
        googleSheetsServiceAccountJson: '{"key": "value"}',
        googleFormsWebhookSecret: "webhook",
        smtpUrl: "https://smtp.example.test",
        smtpFrom: "noreply@example.test",
        emailApiKey: "key",
        imgbbApiKey: "key",
        imageHostProvider: "imgbb",
        verificationSecret: "keep-this",
        mfaEncryptionKey: "keep-this",
        integrationEncryptionKey: "keep-this",
        uploadDir: "keep-this",
        appUrl: "keep-this",
        webOrigin: "keep-this",
      };

      const result = withoutIntegrationCredentials(env);

      // Check that credential fields are removed
      assert(!("recaptchaSiteKey" in result));
      assert(!("googleClientSecret" in result));
      assert(!("emailApiKey" in result));
      assert(!("imgbbApiKey" in result));

      // Check that non-credential fields are kept
      assert.equal(result.verificationSecret, "keep-this");
      assert.equal(result.mfaEncryptionKey, "keep-this");
      assert.equal(result.integrationEncryptionKey, "keep-this");
      assert.equal(result.uploadDir, "keep-this");
      assert.equal(result.appUrl, "keep-this");
      assert.equal(result.webOrigin, "keep-this");
    });

    it("keeps smsProvider and connectionTester", () => {
      const provider = async () => "code";
      const tester = async () => undefined;
      const env: IntegrationEnv = {
        smsProvider: { sendCode: provider, checkCode: async () => true },
        connectionTester: tester,
      };

      const result = withoutIntegrationCredentials(env);
      assert.ok(result.smsProvider);
      assert.equal(result.connectionTester, tester);
    });
  });

  describe("production mode behavior", () => {
    it("production mode ignores env credential variables", () => {
      const env: IntegrationEnv = {
        recaptchaSiteKey: "env-site",
        emailApiKey: "env-key",
        integrationEncryptionKey: validKey,
      };

      const result = withoutIntegrationCredentials(env);
      assert(!("recaptchaSiteKey" in result));
      assert(!("emailApiKey" in result));
    });
  });

  describe("credential security", () => {
    const key = Buffer.from(validKey, "hex");

    it("sealed values contain neither plaintext secrets nor key hex", () => {
      const plaintext = "my-secret-api-key-12345";
      const aad = credentialAad("email", "apiKey");
      const sealed = seal(key, aad, plaintext);

      const stringified = JSON.stringify(sealed);
      assert(!stringified.includes(plaintext), "Plaintext should not appear in sealed value");
      assert(
        !stringified.includes(validKey.toLowerCase()) &&
          !stringified.includes(validKey.toUpperCase()),
        "Key hex should not appear in sealed value",
      );
      // Also check base64 of key doesn't appear
      const keyBase64 = key.toString("base64");
      assert(!stringified.includes(keyBase64), "Key base64 should not appear in sealed value");
    });

    it("keyFingerprint is short and non-reversible", () => {
      const fingerprint = getKeyFingerprint(key);
      assert.equal(fingerprint.length, 8, "Fingerprint should be 8 hex characters");
      // Verify it's derived from the key (deterministic)
      const sameFingerprint = getKeyFingerprint(key);
      assert.equal(fingerprint, sameFingerprint);
      // Different key produces different fingerprint
      const otherKey = Buffer.from(mismatchKey, "hex");
      assert.notEqual(fingerprint, getKeyFingerprint(otherKey));
    });

    it("AAD binds credentials to integration and field", () => {
      const aad1 = credentialAad("google_auth", "clientId");
      const aad2 = credentialAad("google_auth", "clientSecret");
      const aad3 = credentialAad("email", "apiKey");

      assert.notEqual(aad1, aad2, "Different fields should have different AAD");
      assert.notEqual(aad1, aad3, "Different integrations should have different AAD");

      // Sealed with one AAD cannot be opened with another
      const sealed = seal(key, aad1, "value");
      assert.throws(() => {
        const { open: openFn } = require("@Alumni-Tracking-Ss/db/secret-box");
        openFn(key, aad2, sealed);
      });
    });
  });
});

describe("resolveIntegrationEnv with stored credentials", () => {
  const keyHex = "3a".repeat(32);
  const key = Buffer.from(keyHex, "hex");
  const recaptcha = { siteKey: "stored-site-key-0001", secretKey: "stored-recaptcha-secret-9876" };
  const driveJson = JSON.stringify({
    client_email: "drive@example.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n",
    private_key_id: "abcdef123456wxyz",
  });
  const base: IntegrationEnv = {
    integrationEncryptionKey: keyHex,
    recaptchaSiteKey: "env-site-key",
    recaptchaSecretKey: "env-recaptcha-secret",
    googleClientId: "env-client-id",
    smtpUrl: "https://env-gateway.example.test",
    uploadDir: "/uploads",
  };

  async function storedFixture() {
    const f = modelFixture({ IntegrationSetting: [] });
    await storeCredentials(f.db, {
      integration: "recaptcha",
      values: recaptcha,
      key,
      enabled: true,
    });
    await storeCredentials(f.db, {
      integration: "google_drive",
      values: { serviceAccountJson: driveJson, folderId: "drive-folder-1" },
      key,
      enabled: true,
    });
    await storeCredentials(f.db, {
      integration: "google_sheets",
      values: { account: "drive", spreadsheetId: "sheet-1" },
      key,
      enabled: true,
    });
    invalidateIntegrationEnvCache();
    return f;
  }

  it("applies stored values over env values in development", async () => {
    const f = await storedFixture();
    const env = await resolveIntegrationEnv(f.db, { ...base }, { production: false });
    assert.equal(env.recaptchaSiteKey, recaptcha.siteKey);
    assert.equal(env.recaptchaSecretKey, recaptcha.secretKey);
    assert.equal(env.googleClientId, "env-client-id");
    assert.equal(env.uploadDir, "/uploads");
  });

  it("ignores env credentials in production but applies stored values", async () => {
    const f = await storedFixture();
    const env = await resolveIntegrationEnv(f.db, { ...base }, { production: true });
    assert.equal(env.recaptchaSecretKey, recaptcha.secretKey);
    assert.equal(env.googleClientId, undefined);
    assert.equal(env.smtpUrl, undefined);
    assert.equal(env.uploadDir, "/uploads");
  });

  it("does not apply credentials sealed with a different key", async () => {
    const f = await storedFixture();
    const env = await resolveIntegrationEnv(
      f.db,
      { ...base, integrationEncryptionKey: "4b".repeat(32) },
      { production: true },
    );
    assert.equal(env.recaptchaSecretKey, undefined);
    const row = f.tables.IntegrationSetting!.find((item) => item.key === "recaptcha")!;
    assert.equal(
      (await readStoredCredentials(row, Buffer.from("4b".repeat(32), "hex"))).status,
      "mismatch",
    );
  });

  it("gives Google Sheets the Drive service account when it reuses Drive", async () => {
    const f = await storedFixture();
    const env = await resolveIntegrationEnv(f.db, { ...base }, { production: true });
    assert.equal(env.googleSheetsServiceAccountJson, driveJson);
    assert.equal(env.googleSheetsSpreadsheetId, "sheet-1");
  });

  it("erases credentials, hints and fingerprint and disables the integration", async () => {
    const f = await storedFixture();
    await eraseCredentials(f.db, "recaptcha");
    const row = f.tables.IntegrationSetting!.find((item) => item.key === "recaptcha")!;
    assert.equal(row.enabled, false);
    assert.equal(row.credentials, undefined);
    assert.equal(row.credentialHints, undefined);
    assert.equal(row.keyFingerprint, undefined);
    invalidateIntegrationEnvCache();
    const env = await resolveIntegrationEnv(f.db, { ...base }, { production: true });
    assert.equal(env.recaptchaSecretKey, undefined);
  });

  it("stores no plaintext secret and no key material in any document", async () => {
    const f = await storedFixture();
    const stored = JSON.stringify(f.tables);
    for (const secret of [
      recaptcha.secretKey,
      recaptcha.siteKey,
      "drive-folder-1",
      "BEGIN PRIVATE KEY",
    ])
      assert.ok(!stored.includes(secret), `plaintext found: ${secret.slice(0, 6)}`);
    for (const material of [keyHex, keyHex.toUpperCase(), key.toString("base64")])
      assert.ok(!stored.includes(material), "key material found in stored documents");
  });

  it("keeps only short hints for secret fields", async () => {
    const f = await storedFixture();
    const rows = f.tables.IntegrationSetting!;
    const recaptchaRow = rows.find((item) => item.key === "recaptcha")!;
    assert.deepEqual(recaptchaRow.credentialHints, { secretKey: "9876" });
    const driveRow = rows.find((item) => item.key === "google_drive")!;
    assert.deepEqual(driveRow.credentialHints, { serviceAccountJson: "wxyz" });
    await storeCredentials(f.db, {
      integration: "email",
      values: {
        gatewayUrl: "https://mail.example.test",
        fromAddress: "a@example.test",
        apiKey: "short123",
      },
      key,
    });
    const emailRow = rows.find((item) => item.key === "email")!;
    assert.deepEqual(emailRow.credentialHints, { apiKey: "set" });
  });
});
