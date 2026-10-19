import assert from "node:assert/strict";
import { it } from "node:test";
import { generate } from "otplib";
import { call } from "@orpc/server";
import { hashPassword } from "@Alumni-Tracking-Ss/db";
import type { Context } from "../context";
import { dashboardRouter } from "../routers/dashboard";
import { beginMfa, confirmMfa, verifyMfa, privilegedAccount, digest } from "./mfa";
import { consumeAuthAttempt } from "./throttle";

const password = "A private testing passphrase 82!";
async function fixture() {
  let row: Record<string, unknown> | null = null;
  const counts = new Map<string, number>();
  const session = {
    token: "synthetic-session",
    userId: "user",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    mfaVersion: "",
    mfaVerifiedAt: null as Date | null,
  };
  const user = {
    id: "user",
    email: "admin@example.test",
    passwordHash: await hashPassword(password),
  };
  const matches = (record: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => {
      const actual = record[key];
      if (value && typeof value === "object" && !(value instanceof Date)) {
        if ("gt" in value) return Number(actual) > Number(value.gt);
        if ("equals" in value) return JSON.stringify(actual) === JSON.stringify(value.equals);
      }
      return actual === value;
    });
  const tx = {
    user: { findUniqueOrThrow: async () => user },
    authThrottle: {
      upsert: async ({ where }: { where: { key: string } }) => {
        const count = (counts.get(where.key) ?? 0) + 1;
        counts.set(where.key, count);
        return { count };
      },
    },
    mfaCredential: {
      findUnique: async () => (row ? structuredClone(row) : null),
      create: async ({ data }: { data: object }) => {
        if (row) throw new Error("Duplicate");
        row = { id: "mfa", version: "", lastStep: -1, ...data };
        return row;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: object }) => {
        if (!row || !matches(row, where)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    session: {
      create: async ({ data }: { data: object }) => {
        Object.assign(session, data);
        return session;
      },
      findUnique: async () => ({ ...session }),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: object }) => {
        if (!matches(session, where)) return { count: 0 };
        Object.assign(session, data);
        return { count: 1 };
      },
      deleteMany: async () => ({ count: 0 }),
    },
    auditLog: { create: async () => ({ id: "audit" }) },
  };
  let fail = false;
  const context = {
    db: {
      ...tx,
      $transaction: async (work: (value: typeof tx) => Promise<unknown>) => {
        const before = structuredClone(row);
        const beforeSession = { ...session };
        try {
          const result = await work(tx);
          if (fail) throw new Error("Synthetic write failure");
          return result;
        } catch (error) {
          row = before;
          Object.assign(session, beforeSession);
          throw error;
        }
      },
    },
    user: {
      id: "user",
      name: "Admin",
      email: user.email,
      image: null,
      status: "active",
      roles: ["super_admin"],
      permissions: ["dashboard.read"],
    },
    sessionToken: session.token,
    ipAddress: null,
    userAgent: null,
    integrationEnv: { mfaEncryptionKey: "23".repeat(32) },
  } as unknown as Context;
  context.onSessionRotation = (value) => {
    context.sessionToken = value.token;
    context.sessionStorageToken = "sha256:" + digest(value.token);
  };
  return {
    context,
    session,
    get row() {
      return row;
    },
    setFail: () => {
      fail = true;
    },
  };
}
async function enrolled() {
  const f = await fixture();
  const setup = await beginMfa(f.context, password);
  const code = await generate({ secret: setup.secret });
  const result = await confirmMfa(f.context, code);
  return {
    ...f,
    get row() {
      return f.row;
    },
    setup,
    code,
    ...result,
  };
}
it("blocks administrator access until MFA and treats delegated administration as privileged", async () => {
  const f = await fixture();
  await assert.rejects(
    () => call(dashboardRouter.summary, undefined, { context: f.context }),
    /Verify your authenticator/,
  );
  assert.equal(privilegedAccount({ roles: [], permissions: ["users.write"] }), true);
  f.context.user!.mfaVerified = true;
  await assert.rejects(
    () => call(dashboardRouter.summary, undefined, { context: f.context }),
    /count/,
  ); // Passed the gate and reached the intentionally absent dashboard adapter.
});
it("requires a configured key and current password before enrollment", async () => {
  const f = await fixture();
  await assert.rejects(() => beginMfa(f.context, "incorrect"), /current password/);
  assert.equal(f.row, null);
  f.context.integrationEnv.mfaEncryptionKey = undefined;
  await assert.rejects(() => beginMfa(f.context, password), /not configured/);
});
it("encrypts enrollment secrets, binds setup to its session and expires it", async () => {
  const f = await fixture();
  const setup = await beginMfa(f.context, password);
  assert.ok(!JSON.stringify(f.row).includes(setup.secret));
  f.context.sessionToken = "different-session";
  await assert.rejects(
    async () => confirmMfa(f.context, await generate({ secret: setup.secret })),
    /invalid/,
  );
});
it("rejects expired and invalid enrollment codes without enabling MFA", async () => {
  const f = await fixture();
  const setup = await beginMfa(f.context, password);
  await assert.rejects(
    async () =>
      confirmMfa(
        f.context,
        await generate({ secret: setup.secret, epoch: Math.floor(Date.now() / 1000) - 300 }),
      ),
    /invalid/,
  );
  f.row!.pendingUntil = new Date(0);
  await assert.rejects(
    async () => confirmMfa(f.context, await generate({ secret: setup.secret })),
    /invalid/,
  );
  assert.equal(f.row!.secretCipher, undefined);
});
it("confirms enrollment once and stores only recovery digests", async () => {
  const f = await enrolled();
  assert.equal(f.recoveryCodes.length, 10);
  assert.equal(new Set(f.recoveryCodes).size, 10);
  assert.ok(f.session.mfaVerifiedAt);
  assert.ok(!JSON.stringify(f.row).includes(f.recoveryCodes[0]!));
  await assert.rejects(() => confirmMfa(f.context, f.code), /invalid/);
  await assert.rejects(() => verifyMfa(f.context, f.code), /invalid/);
});
it("consumes recovery codes once and requires a recent primary sign-in", async () => {
  const f = await enrolled();
  await verifyMfa(f.context, f.recoveryCodes[0]!);
  await assert.rejects(() => verifyMfa(f.context, f.recoveryCodes[0]!), /invalid/);
  f.session.createdAt = new Date(0);
  await assert.rejects(() => verifyMfa(f.context, f.recoveryCodes[1]!), /Sign in again/);
});
it("cannot replace an enrolled authenticator using the password alone", async () => {
  const f = await enrolled();
  await assert.rejects(() => beginMfa(f.context, password), /Verify with your authenticator/);
});
it("requires a recent second factor to replace MFA and invalidates old recovery codes", async () => {
  const f = await enrolled();
  f.context.user!.mfaVerified = true;
  f.context.user!.mfaVersion = String(f.row!.version);
  f.context.user!.mfaFresh = false;
  await assert.rejects(() => beginMfa(f.context, password), /Verify with your authenticator/);
  f.context.user!.mfaFresh = true;
  const setup = await beginMfa(f.context, password);
  const result = await confirmMfa(f.context, await generate({ secret: setup.secret }));
  assert.notEqual(result.recoveryCodes[0], f.recoveryCodes[0]);
  await assert.rejects(() => verifyMfa(f.context, f.recoveryCodes[0]!), /invalid/);
});
it("rolls back enrollment and session elevation on transaction failure", async () => {
  const f = await fixture();
  const setup = await beginMfa(f.context, password);
  f.setFail();
  await assert.rejects(
    async () => confirmMfa(f.context, await generate({ secret: setup.secret })),
    /Synthetic write failure/,
  );
  assert.equal(f.row!.secretCipher, undefined);
  assert.equal(f.session.mfaVerifiedAt, null);
});
it("shares per-account budgets across contexts and recovers in the next window", async () => {
  const f = await fixture();
  await Promise.all(
    Array.from({ length: 5 }, () =>
      consumeAuthAttempt(f.context.db, "test", "User@Example.test", 5, 1000, 100),
    ),
  );
  await assert.rejects(
    () => consumeAuthAttempt(f.context.db, "test", "user@example.test", 5, 1000, 101),
    /Too many attempts/,
  );
  await consumeAuthAttempt(f.context.db, "test", "user@example.test", 5, 1000, 1001);
});
