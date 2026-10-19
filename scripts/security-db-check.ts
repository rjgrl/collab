import assert from "node:assert/strict";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { generate } from "otplib";
import { createPrismaClient, hashPassword, verifyPassword } from "../packages/db/src/index";
import { projectRoot, runTool } from "../scripts/local-tools.mjs";
import { isManagedLocalDatabase } from "../scripts/local-env.mjs";
import { beginMfa, confirmMfa, verifyMfa, digest } from "../packages/api/src/services/mfa";
import {
  createSession,
  storedSessionToken,
  loadAuthUserFromToken,
} from "../packages/api/src/services/session";
import { consumeAuthAttempt } from "../packages/api/src/services/throttle";
import { requestPasswordReset, resetPassword } from "../packages/api/src/services/password-reset";
import type { Context } from "../packages/api/src/context";
import { recoverLocalAdministrator } from "../packages/api/src/services/local-recovery";
import { call } from "@orpc/server";
import { authRouter } from "../packages/api/src/routers/rbac";
import { createGooglePassword } from "../packages/api/src/services/verification";
if (process.env.NODE_ENV === "production")
  throw new Error("Security database checks are local-only.");
process.env.PASSWORD_BREACH_CHECK = "local";

const url = `mongodb://127.0.0.1:27018/collab_security_${randomBytes(6).toString("hex")}?replicaSet=rs0`;
if (!isManagedLocalDatabase(url)) throw Error("Unsafe test target");
await runTool(
  "prisma",
  "prisma",
  [
    "db",
    "push",
    "--skip-generate",
    "--schema",
    path.join(projectRoot, "packages/db/prisma/schema"),
  ],
  {
    cwd: path.join(projectRoot, "packages/db"),
    toolRoot: path.join(projectRoot, "packages/db"),
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: url },
  },
);
const db = createPrismaClient({ DATABASE_URL: url });
const peer = createPrismaClient({ DATABASE_URL: url });
const nativeFetch = globalThis.fetch;
try {
  assert.equal(await db.user.count(), 0);
  await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      consumeAuthAttempt(i % 2 ? peer : db, "probe", "shared-account", 5, 1000000),
    ),
  );
  await assert.rejects(
    () => consumeAuthAttempt(peer, "probe", "shared-account", 5, 1000000),
    /Too many attempts/,
  );
  const rollback = new Error("ROLLBACK_SYNTHETIC_PROBE");
  try {
    await db.$transaction(
      async (tx) => {
        const adapter = {
          ...tx,
          $transaction: async (work: (value: typeof tx) => Promise<unknown>) => work(tx),
        } as unknown as Context["db"];
        const password = "Synthetic private database passphrase 7665";
        const user = await tx.user.create({
          data: {
            name: "Synthetic security probe",
            email: "probe@example.test",
            emailVerified: true,
            passwordHash: await hashPassword(password),
            userRoles: {
              create: { role: { create: { key: "super_admin", name: "Synthetic Admin" } } },
            },
          },
        });
        const session = await createSession(adapter, user.id, {});
        let currentToken = session.token;
        const context = {
          db: adapter,
          user: await loadAuthUserFromToken(adapter, currentToken),
          sessionToken: currentToken,
          sessionStorageToken: storedSessionToken(currentToken),
          ipAddress: null,
          userAgent: null,
          integrationEnv: {
            mfaEncryptionKey: "56".repeat(32),
            webOrigin: "https://app.example.test",
            smtpUrl: "https://mail.example.test",
          },
        } as Context;
        context.onSessionRotation = (next) => {
          currentToken = next.token;
          context.sessionToken = next.token;
          context.sessionStorageToken = storedSessionToken(next.token);
        };
        const setup = await beginMfa(context, password);
        const result = await confirmMfa(context, await generate({ secret: setup.secret }));
        assert.equal(await loadAuthUserFromToken(adapter, session.token), null);
        assert.equal((await loadAuthUserFromToken(adapter, currentToken))?.mfaVerified, true);
        assert.equal(await loadAuthUserFromToken(adapter, storedSessionToken(currentToken)), null);
        const beforeRecovery = currentToken;
        await verifyMfa(context, result.recoveryCodes[0]!);
        assert.notEqual(currentToken, beforeRecovery);
        assert.equal(await loadAuthUserFromToken(adapter, beforeRecovery), null);
        await assert.rejects(() => verifyMfa(context, result.recoveryCodes[0]!), /invalid/);
        const beforePasswordChange = currentToken;
        await call(
          authRouter.changePassword,
          { currentPassword: password, password: "Changed private database passphrase 8989" },
          { context },
        );
        assert.notEqual(currentToken, beforePasswordChange);
        assert.equal(await loadAuthUserFromToken(adapter, beforePasswordChange), null);
        assert.equal((await loadAuthUserFromToken(adapter, currentToken))?.mfaVerified, true);
        const credential = await tx.mfaCredential.findUniqueOrThrow({ where: { userId: user.id } });
        assert.ok(!credential.secretCipher!.includes(setup.secret));
        assert.ok(!credential.recoveryHashes.includes(result.recoveryCodes[1]!));
        await tx.integrationSetting.create({ data: { key: "email", enabled: true } });
        let resetToken = "";
        globalThis.fetch = async (input, init) => {
          assert.equal(String(input), "https://mail.example.test");
          const text = JSON.parse(String(init?.body)).text;
          resetToken = new URLSearchParams(
            new URL(text.match(/https:\/\/[^\s]+/)[0]).hash.slice(1),
          ).get("token")!;
          return Response.json({ ok: true });
        };
        await requestPasswordReset(context, user.email);
        assert.ok(await tx.passwordReset.findUnique({ where: { tokenHash: digest(resetToken) } }));
        await resetPassword(context, resetToken, "Replacement private database passphrase 8776");
        assert.equal(await tx.session.count({ where: { userId: user.id } }), 0);
        assert.ok(await tx.mfaCredential.findUnique({ where: { userId: user.id } }));
        const changed = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
        assert.equal(
          await verifyPassword(
            "Replacement private database passphrase 8776",
            changed.passwordHash!,
          ),
          true,
        );
        await assert.rejects(
          () => resetPassword(context, resetToken, "Another private database passphrase 9887"),
          /already used/,
        );
        await recoverLocalAdministrator(
          adapter,
          user.email,
          "Replacement private database passphrase 8776",
          "RESET MY AUTHENTICATOR",
        );
        assert.equal(await tx.mfaCredential.count(), 0);
        assert.ok(await tx.auditLog.findFirst({ where: { action: "auth.mfa.local_recovery" } }));
        const google = await tx.user.create({
          data: {
            name: "Synthetic Google user",
            email: "google-probe@example.test",
            emailVerified: true,
          },
        });
        const googleSession = await createSession(adapter, google.id, {
          googleVerifiedAt: new Date(),
        });
        const googleContext = {
          ...context,
          user: await loadAuthUserFromToken(adapter, googleSession.token),
          sessionToken: googleSession.token,
          sessionStorageToken: storedSessionToken(googleSession.token),
        } as Context;
        let googleRotated = "";
        googleContext.onSessionRotation = (value) => {
          googleRotated = value.token;
        };
        await createGooglePassword(googleContext, "Initial private Google passphrase 9797");
        assert.ok(googleRotated);
        assert.equal(await loadAuthUserFromToken(adapter, googleSession.token), null);
        assert.ok(await loadAuthUserFromToken(adapter, googleRotated));
        throw rollback;
      },
      { timeout: 60000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.equal(await db.user.count(), 0);
  assert.equal(await db.mfaCredential.count(), 0);
  assert.equal(await db.passwordReset.count(), 0);
  console.log(
    "PASS: real isolated MongoDB indexes, shared counters across clients, MFA enrollment/rotation/recovery, encrypted secrets, reset/revocation and transaction rollback. No application database records changed.",
  );
} finally {
  globalThis.fetch = nativeFetch;
  await peer.$disconnect();
  await db.$disconnect();
}
