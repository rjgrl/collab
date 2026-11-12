import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { generate } from "otplib";
import { createDatabase, hashPassword, verifyPassword } from "../packages/db/src/index";
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
import { authService } from "../apps/server/src/modules/auth/service";
import { migrateDatabase } from "../packages/db/src/migration";
import { createGooglePassword } from "../packages/api/src/services/verification";
if (process.env.NODE_ENV === "production")
  throw new Error("Security database checks are local-only.");
process.env.PASSWORD_BREACH_CHECK = "local";

const url = `mongodb://127.0.0.1:27018/collab_security_${randomBytes(6).toString("hex")}?replicaSet=rs0`;
if (!isManagedLocalDatabase(url)) throw Error("Unsafe test target");
const db = createDatabase({ DATABASE_URL: url });
const peer = createDatabase({ DATABASE_URL: url });
await db.ready();
const schema = await migrateDatabase(db, "apply");
assert.deepEqual(schema.conflicts, []);
const nativeFetch = globalThis.fetch;
try {
  assert.equal(await db.User.countDocuments(), 0);
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
    await db.transaction(async (tx) => {
      const adapter = tx;
      const password = "Synthetic private database passphrase 7665";
      const role = await new tx.Role({ key: "super_admin", name: "Synthetic Admin" }).save();
      const user = await new tx.User({
        name: "Synthetic security probe",
        email: "probe@example.test",
        emailVerified: true,
        passwordHash: await hashPassword(password),
      }).save();
      await new tx.UserRole({ userId: user._id, roleId: role._id }).save();
      const session = await createSession(adapter, user._id.toHexString(), {});
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
      // A real HTTP request reloads the rotated session and its MFA proof.
      context.user = await loadAuthUserFromToken(adapter, currentToken);
      assert.equal(context.user?.mfaVerified, true);
      const beforePasswordChange = currentToken;
      await authService.changePassword(context, {
        currentPassword: password,
        password: "Changed private database passphrase 8989",
      });
      assert.notEqual(currentToken, beforePasswordChange);
      assert.equal(await loadAuthUserFromToken(adapter, beforePasswordChange), null);
      assert.equal((await loadAuthUserFromToken(adapter, currentToken))?.mfaVerified, true);
      const credential = await tx.MfaCredential.findOne({ userId: user._id }).orFail();
      assert.ok(!credential.secretCipher!.includes(setup.secret));
      assert.ok(!credential.recoveryHashes.includes(result.recoveryCodes[1]!));
      await new tx.IntegrationSetting({ key: "email", enabled: true }).save();
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
      assert.ok(await tx.PasswordReset.findOne({ tokenHash: digest(resetToken) }));
      await resetPassword(context, resetToken, "Replacement private database passphrase 8776");
      assert.equal(await tx.Session.countDocuments({ userId: user._id }), 0);
      assert.ok(await tx.MfaCredential.findOne({ userId: user._id }));
      const changed = await tx.User.findById(user._id).orFail();
      assert.equal(
        await verifyPassword("Replacement private database passphrase 8776", changed.passwordHash!),
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
      assert.equal(await tx.MfaCredential.countDocuments(), 0);
      assert.ok(await tx.AuditLog.findOne({ action: "auth.mfa.local_recovery" }));
      const google = await new tx.User({
        name: "Synthetic Google user",
        email: "google-probe@example.test",
        emailVerified: true,
      }).save();
      const googleSession = await createSession(adapter, google._id.toHexString(), {
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
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.equal(await db.User.countDocuments(), 0);
  assert.equal(await db.MfaCredential.countDocuments(), 0);
  assert.equal(await db.PasswordReset.countDocuments(), 0);
  console.log(
    "PASS: real isolated MongoDB indexes, shared counters across clients, MFA enrollment/rotation/recovery, encrypted secrets, reset/revocation and transaction rollback. No application database records changed.",
  );
} finally {
  globalThis.fetch = nativeFetch;
  await peer.disconnect();
  await db.disconnect();
}
