import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { it } from "node:test";
import { requireAccess } from "./access";
import { authSchemas } from "@Alumni-Tracking-Ss/contracts/auth";
import { modelFixture } from "./services/model-test-fixture";
import type { Context } from "./context";
import {
  accountAccessPending,
  confirmVerification,
  createGooglePassword,
  startVerification,
} from "./services/verification";
import { sendPhoneCode } from "./integrations/sms";
import { storedSessionToken } from "./services/session";

const secret = "synthetic-unit-test-key-only-1234567890";
it("lets an existing password account confirm its email without adding phone restrictions", async (t) => {
  const f = fixture();
  f.user.verificationRequired = false;
  let code = "";
  t.mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => {
    code = JSON.parse(String(init?.body)).text.match(/\b\d{6}\b/)[0];
    return Response.json({ ok: true });
  });
  await startVerification(f.context, "email");
  await confirmVerification(f.context, "email", code);
  assert.equal(f.user.emailVerified, true);
  assert.equal(f.user.verificationRequired, false);
  assert.equal(f.user.phoneVerified, false);
  assert.match(String(f.audits[0]?.summary), /Confirmed email ownership for "member@example.test"/);
  assert.equal(String(f.audits[0]?.summary).includes(code), false);
});
function fixture() {
  const user = {
    id: "user",
    status: "active",
    email: "member@example.test",
    phoneNumber: "+639171234567",
    emailVerified: false,
    phoneVerified: false,
    verificationRequired: true,
    passwordHash: null as string | null,
    needsProfileCompletion: false,
  };
  const session = {
    token: "current-session",
    userId: user.id,
    expiresAt: new Date(Date.now() + 60_000),
    googleVerifiedAt: new Date() as Date | null,
  };
  const row = {
    id: "challenge",
    userId: user.id,
    kind: "email",
    target: user.email,
    nonce: "synthetic-nonce",
    codeHash: createHmac("sha256", secret).update("synthetic-nonce:123456").digest("hex") as
      | string
      | null,
    providerSid: null as string | null,
    expiresAt: new Date(Date.now() + 600_000),
    sentAt: new Date(0),
    attempts: 0,
    consumedAt: null as Date | null,
    updatedAt: new Date(),
  };
  const f = modelFixture({
    User: [user],
    Session: [session],
    VerificationChallenge: [row],
    IntegrationSetting: [{ key: "email", enabled: true }],
  });
  const db = f.db;
  const context = {
    db,
    user: { id: user.id, status: "active" },
    sessionToken: session.token,
    integrationEnv: { verificationSecret: secret, smtpUrl: "https://mail.example.test" },
  } as unknown as Context;
  context.onSessionRotation = (value) => {
    context.sessionToken = value.token;
    context.sessionStorageToken = storedSessionToken(value.token);
  };
  return {
    context,
    user,
    get audits() {
      return f.tables.AuditLog ?? [];
    },
    get session() {
      return f.tables.Session![0]!;
    },
    row,
  };
}

it("restricts new unverified accounts and passwordless accounts while preserving existing password accounts", () => {
  assert.equal(
    accountAccessPending({
      verificationRequired: true,
      emailVerified: false,
      phoneVerified: true,
      passwordHash: "hash",
    }),
    true,
  );
  assert.equal(
    accountAccessPending({
      verificationRequired: true,
      emailVerified: true,
      phoneVerified: false,
      passwordHash: "hash",
    }),
    true,
  );
  assert.equal(accountAccessPending({ passwordHash: null }), true);
  assert.equal(accountAccessPending({}), true);
  assert.equal(accountAccessPending({ passwordHash: "legacy-hash" }), false);
  assert.equal(
    accountAccessPending({
      verificationRequired: true,
      emailVerified: true,
      phoneVerified: true,
      passwordHash: "hash",
    }),
    false,
  );
});
it("requires fresh Google verification to create a password without a current password", async () => {
  const f = fixture();
  f.session.googleVerifiedAt = new Date(Date.now() - 600_000);
  await assert.rejects(
    () => createGooglePassword(f.context, "SyntheticPassword123!"),
    /Verify with Google again/,
  );
  assert.equal(f.user.passwordHash, null);
  f.session.googleVerifiedAt = new Date();
  await createGooglePassword(f.context, "SyntheticPassword123!");
  assert.ok(f.user.passwordHash);
  assert.notEqual(f.user.passwordHash, "SyntheticPassword123!");
  assert.equal(f.session.googleVerifiedAt, null);
  await assert.rejects(
    () => createGooglePassword(f.context, "AnotherPassword123!"),
    /Verify with Google again/,
  );
});
it("cannot create a password using another session or overwrite an existing password", async () => {
  const f = fixture();
  f.context.sessionToken = "other-session";
  await assert.rejects(
    () => createGooglePassword(f.context, "SyntheticPassword123!"),
    /Verify with Google again/,
  );
  f.context.sessionToken = String(f.session.token);
  f.user.passwordHash = "existing-hash";
  await assert.rejects(
    () => createGooglePassword(f.context, "SyntheticPassword123!"),
    /already set/,
  );
  assert.equal(f.user.passwordHash, "existing-hash");
  assert.ok(f.session.googleVerifiedAt);
});
it("rejects mismatched password confirmation at the API boundary", async () => {
  assert.equal(
    authSchemas.createGooglePassword.input.safeParse({
      password: "SyntheticPassword123!",
      confirmation: "DifferentPassword123!",
    }).success,
    false,
  );
});
it("email codes are consumed once and never verify a phone", async () => {
  const f = fixture();
  await confirmVerification(f.context, "email", "123456");
  assert.equal(f.user.emailVerified, true);
  assert.equal(f.user.phoneVerified, false);
  assert.equal(f.row.codeHash, null);
  await assert.rejects(() => confirmVerification(f.context, "email", "123456"), /expired|used/);
});
it("limits wrong codes to five attempts and rejects expired codes", async () => {
  const f = fixture();
  for (let i = 0; i < 5; i++)
    await assert.rejects(() => confirmVerification(f.context, "email", "000000"), /incorrect/);
  await assert.rejects(() => confirmVerification(f.context, "email", "123456"), /failed attempts/);
  assert.equal(f.user.emailVerified, false);
  const expired = fixture();
  expired.row.expiresAt = new Date(0);
  await assert.rejects(() => confirmVerification(expired.context, "email", "123456"), /expired/);
});
it("cannot verify a changed email or reuse a failed transaction's consumption", async () => {
  const f = fixture();
  f.user.email = "changed@example.test";
  await assert.rejects(
    () => confirmVerification(f.context, "email", "123456"),
    /contact details changed/,
  );
  assert.equal(f.user.emailVerified, false);
  assert.equal(f.row.consumedAt, null);
});
it("email delivery stores a keyed digest, rotates codes, and enforces resend cooldown", async (t) => {
  const f = fixture();
  let delivered = "";
  t.mock.method(globalThis, "fetch", async (_input: unknown, init: RequestInit) => {
    delivered = String(init.body);
    return Response.json({ ok: true });
  });
  const result = await startVerification(f.context, "email");
  const code = delivered.match(/\b[0-9]{6}\b/)?.[0];
  assert.ok(code);
  assert.notEqual(f.row.codeHash, code);
  assert.equal("code" in result, false);
  await assert.rejects(() => startVerification(f.context, "email"), /Wait 60 seconds/);
  await assert.rejects(() => confirmVerification(f.context, "email", "123456"), /incorrect/);
  await confirmVerification(f.context, "email", code);
  assert.equal(f.user.emailVerified, true);
});
it("the SMS stub and missing mail credentials never verify contact ownership", async () => {
  const f = fixture();
  await assert.rejects(() => sendPhoneCode({}, f.user.phoneNumber), /not connected/);
  await assert.rejects(() => startVerification(f.context, "phone"), /not configured/);
  f.context.integrationEnv.smtpUrl = undefined;
  await assert.rejects(() => startVerification(f.context, "email"), /unavailable/);
  assert.equal(f.user.phoneVerified, false);
  assert.equal(f.user.emailVerified, false);
});

it("pending accounts cannot bypass verification by calling a protected API directly", async () => {
  const f = fixture();
  f.context.user = {
    ...f.context.user!,
    needsProfileCompletion: true,
    permissions: ["dashboard.read"],
  };
  assert.throws(() => requireAccess(f.context, "dashboard.read"), /Complete account verification/);
});
