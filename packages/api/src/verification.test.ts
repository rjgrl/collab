import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { it } from "node:test";
import { call } from "@orpc/server";
import type { Context } from "./context";
import { dashboardRouter } from "./routers/dashboard";
import { authRouter } from "./routers/rbac";
import {
  accountAccessPending,
  confirmVerification,
  createGooglePassword,
  startVerification,
} from "./services/verification";
import { sendPhoneCode } from "./integrations/sms";

const secret = "synthetic-unit-test-key-only-1234567890";
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
  const tx = {
    auditLog: { create: async () => ({ id: "audit" }) },
    user: {
      findUniqueOrThrow: async () => user,
      updateMany: async ({
        where,
        data,
      }: {
        where: { email?: string; phoneNumber?: string; OR?: unknown };
        data: Record<string, unknown>;
      }) => {
        if (
          (where.email && where.email !== user.email) ||
          (where.phoneNumber && where.phoneNumber !== user.phoneNumber) ||
          (where.OR && user.passwordHash !== null)
        )
          return { count: 0 };
        Object.assign(user, data);
        return { count: 1 };
      },
    },
    session: {
      updateMany: async ({
        where,
      }: {
        where: { token: string; googleVerifiedAt: { gt: Date } };
      }) => {
        if (
          where.token !== session.token ||
          !session.googleVerifiedAt ||
          session.googleVerifiedAt <= where.googleVerifiedAt.gt
        )
          return { count: 0 };
        session.googleVerifiedAt = null;
        return { count: 1 };
      },
      deleteMany: async () => ({ count: 0 }),
    },
    verificationChallenge: {
      findUnique: async () => ({ ...row }),
      upsert: async () => ({ ...row }),
      updateMany: async ({
        where,
        data,
      }: {
        where: { nonce?: string; consumedAt?: null; attempts?: { lt?: number; lte?: number } };
        data: Record<string, unknown>;
      }) => {
        if (
          (where.nonce && where.nonce !== row.nonce) ||
          (where.consumedAt === null && row.consumedAt) ||
          (where.attempts?.lt !== undefined && row.attempts >= where.attempts.lt)
        )
          return { count: 0 };
        const attempts = data.attempts;
        if (attempts && typeof attempts === "object" && "increment" in attempts)
          row.attempts += Number(attempts.increment);
        else if (typeof attempts === "number") row.attempts = attempts;
        Object.assign(row, { ...data, attempts: row.attempts });
        return { count: 1 };
      },
    },
    integrationSetting: { findUnique: async () => ({ enabled: true }) },
  };
  const db = {
    ...tx,
    $transaction: async (work: (transaction: typeof tx) => Promise<unknown>) => {
      const before = structuredClone({ user, session, row });
      try {
        return await work(tx);
      } catch (error) {
        Object.assign(user, before.user);
        Object.assign(session, before.session);
        Object.assign(row, before.row);
        throw error;
      }
    },
  };
  const context = {
    db,
    user: { id: user.id, status: "active" },
    sessionToken: session.token,
    integrationEnv: { verificationSecret: secret, smtpUrl: "https://mail.example.test" },
  } as unknown as Context;
  return { context, user, session, row };
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
  f.context.sessionToken = f.session.token;
  f.user.passwordHash = "existing-hash";
  await assert.rejects(
    () => createGooglePassword(f.context, "SyntheticPassword123!"),
    /already set/,
  );
  assert.equal(f.user.passwordHash, "existing-hash");
  assert.ok(f.session.googleVerifiedAt);
});
it("rejects mismatched password confirmation at the API boundary", async () => {
  await assert.rejects(
    () =>
      call(
        authRouter.createGooglePassword,
        { password: "SyntheticPassword123!", confirmation: "DifferentPassword123!" },
        { context: fixture().context },
      ),
    /validation/i,
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
  await assert.rejects(
    () => call(dashboardRouter.summary, undefined, { context: f.context }),
    /Complete account verification/,
  );
});
