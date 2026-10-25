import assert from "node:assert/strict";
import { it } from "node:test";
import { hashPassword, verifyPassword } from "@Alumni-Tracking-Ss/db";
import type { Context } from "../context";
import { authService } from "../../../../apps/server/src/modules/auth/service";
import { modelFixture } from "./model-test-fixture";
import { storedSessionToken } from "./session";
import { digest } from "./mfa";
import { resetPassword } from "./password-reset";

const id = "000000000000000000000001";
const password = "Private synthetic test passphrase 123!";
async function fixture() {
  const user = {
    id,
    name: "Test Account",
    email: "old@example.test",
    emailVerified: true,
    status: "active",
    passwordHash: await hashPassword(password),
    alumniId: "000000000000000000000002",
  };
  const f = modelFixture({
    User: [user],
    Alumni: [{ id: user.alumniId, personalEmail: user.email, deletedAt: null }],
    IntegrationSetting: [{ key: "email", enabled: true }],
    Session: [
      {
        id: "current",
        token: "current-session",
        userId: id,
        expiresAt: new Date(Date.now() + 60_000),
        mfaVersion: "preserved",
        mfaVerifiedAt: new Date(),
      },
      { id: "other", token: "other-session", userId: id, expiresAt: new Date(Date.now() + 60_000) },
    ],
    PasswordReset: [{ id: "old-reset", userId: id, consumedAt: null }],
  });
  let rotated = "";
  const context = {
    db: f.db,
    user: {
      id,
      name: user.name,
      email: user.email,
      image: null,
      status: "active",
      roles: ["staff"],
      permissions: [],
    },
    sessionToken: "current-session",
    ipAddress: null,
    userAgent: null,
    integrationEnv: {
      verificationSecret: "test-only-verification-key-with-32-characters",
      smtpUrl: "https://mail.example.test",
    },
    onSessionRotation: (session) => {
      rotated = session.token;
    },
  } as Context;
  return {
    ...f,
    context,
    user,
    get rotated() {
      return rotated;
    },
  };
}
async function issue(f: Awaited<ReturnType<typeof fixture>>, email = "new@example.test") {
  const native = globalThis.fetch;
  let code = "";
  try {
    globalThis.fetch = async (_url, init) => {
      const message = JSON.parse(String(init?.body));
      assert.equal(message.to, email);
      code = message.text.match(/\b\d{6}\b/)[0];
      return Response.json({ ok: true });
    };
    await authService.requestEmailChange(f.context, { email, currentPassword: password });
  } finally {
    globalThis.fetch = native;
  }
  assert.match(code, /^\d{6}$/);
  return code;
}

it("email change preserves the current verified login until confirmation, then rotates sessions and invalidates old recovery", async () => {
  const f = await fixture();
  const code = await issue(f);
  assert.equal(f.user.email, "old@example.test");
  assert.equal(f.user.emailVerified, true);
  assert.equal(
    (await authService.verificationStatus(f.context, {})).pendingEmail,
    "new@example.test",
  );
  assert.ok(!JSON.stringify(f.tables.VerificationChallenge).includes(code));
  await authService.confirmEmailChange(f.context, {
    email: "new@example.test",
    currentPassword: password,
    code,
  });
  assert.equal(f.user.email, "new@example.test");
  assert.equal(f.user.emailVerified, true);
  assert.equal(f.tables.Alumni![0]!.personalEmail, "new@example.test");
  assert.equal(f.tables.PasswordReset!.length, 0);
  assert.equal(f.tables.Session!.length, 1);
  assert.equal(f.tables.Session![0]!.token, storedSessionToken(f.rotated));
  assert.equal(f.tables.Session![0]!.mfaVersion, "preserved");
  await assert.rejects(
    () =>
      authService.confirmEmailChange(f.context, {
        email: "new@example.test",
        currentPassword: password,
        code,
      }),
    /expired|used|pending/,
  );
});
it("rejects password failures, duplicate addresses and direct unverified profile edits", async () => {
  const f = await fixture();
  await assert.rejects(
    () =>
      authService.requestEmailChange(f.context, {
        email: "new@example.test",
        currentPassword: "incorrect",
      }),
    /password is incorrect/,
  );
  f.tables.User!.push({ id: "other-account", email: "used@example.test" });
  await assert.rejects(
    () =>
      authService.requestEmailChange(f.context, {
        email: "used@example.test",
        currentPassword: password,
      }),
    /already in use/,
  );
  await assert.rejects(() =>
    authService.updateProfile(f.context, {
      firstName: "Test",
      lastName: "Account",
      email: "bypass@example.test",
    } as never),
  );
  assert.equal(f.user.email, "old@example.test");
  assert.equal(f.tables.VerificationChallenge?.length ?? 0, 0);
});
it("rejects expired, incorrect and mismatched confirmation codes without changing email", async () => {
  const f = await fixture();
  const code = await issue(f);
  await assert.rejects(
    () =>
      authService.confirmEmailChange(f.context, {
        email: "new@example.test",
        currentPassword: password,
        code: code === "000000" ? "111111" : "000000",
      }),
    /incorrect/,
  );
  await assert.rejects(
    () =>
      authService.confirmEmailChange(f.context, {
        email: "different@example.test",
        currentPassword: password,
        code,
      }),
    /pending email changed/,
  );
  f.tables.VerificationChallenge![0]!.expiresAt = new Date(0);
  await assert.rejects(
    () =>
      authService.confirmEmailChange(f.context, {
        email: "new@example.test",
        currentPassword: password,
        code,
      }),
    /expired/,
  );
  assert.equal(f.user.email, "old@example.test");
});
it("rolls back email, challenge consumption and sessions if linked contact synchronization fails", async () => {
  const f = await fixture();
  const code = await issue(f);
  f.failWrite("Alumni", "updateOne", new Error("Synthetic linked write failure"));
  await assert.rejects(
    () =>
      authService.confirmEmailChange(f.context, {
        email: "new@example.test",
        currentPassword: password,
        code,
      }),
    /linked write failure/,
  );
  assert.equal(f.user.email, "old@example.test");
  assert.equal(f.tables.VerificationChallenge![0]!.consumedAt, null);
  assert.equal(f.tables.Session!.length, 2);
  assert.equal(f.tables.PasswordReset!.length, 1);
});
it("rejects a reset token inserted by an old-mailbox request after email confirmation commits", async () => {
  const f = await fixture();
  const oldVersion = digest(f.user.passwordHash);
  const code = await issue(f);
  await authService.confirmEmailChange(f.context, {
    email: "new@example.test",
    currentPassword: password,
    code,
  });
  assert.equal(await verifyPassword(password, f.user.passwordHash), true);
  assert.notEqual(digest(f.user.passwordHash), oldVersion);
  const oldMailboxToken = "1".repeat(64);
  f.tables.PasswordReset!.push({
    id: "in-flight-old-mailbox",
    userId: id,
    tokenHash: digest(oldMailboxToken),
    passwordVersion: oldVersion,
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
  });
  await assert.rejects(
    () => resetPassword(f.context, oldMailboxToken, "A different synthetic passphrase 876!"),
    /invalid/,
  );
  assert.equal(f.user.email, "new@example.test");
  assert.equal(await verifyPassword(password, f.user.passwordHash), true);
});
