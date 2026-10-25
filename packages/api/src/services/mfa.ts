import { toEntity } from "@Alumni-Tracking-Ss/db";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import { ApiError } from "../http-error";
import { verifyPassword } from "@Alumni-Tracking-Ss/db";
import { rotateSession } from "./session-rotation";
import type { Context } from "../context";
import { writeAudit } from "../audit";
import { authorizationTransaction } from "./authorization";
import { consumeAuthAttempt } from "./throttle";
import { requiresMfa, localMfaDisabled, privilegedAccount } from "./mfa-policy";
export { privilegedAccount } from "./mfa-policy";

export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function encryptionKey(context: Context) {
  const key = context.integrationEnv.mfaEncryptionKey;
  if (!key || !/^[a-f0-9]{64}$/i.test(key))
    throw new ApiError("SERVICE_UNAVAILABLE", {
      message: "Authenticator security is not configured. Contact an administrator.",
    });
  return Buffer.from(key, "hex");
}
export function encryptMfaSecret(context: Context, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(context), iv);
  cipher.setAAD(Buffer.from(`mfa:${context.user!.id}`));
  const body = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("hex"), cipher.getAuthTag().toString("hex"), body.toString("hex")].join(
    ".",
  );
}
function decrypt(context: Context, envelope: string) {
  const [version, iv, tag, body] = envelope.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Invalid authenticator storage.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(context), Buffer.from(iv, "hex"));
  decipher.setAAD(Buffer.from(`mfa:${context.user!.id}`));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(body, "hex")), decipher.final()]).toString(
    "utf8",
  );
}
const failed = () =>
  new ApiError("BAD_REQUEST", { message: "The code is invalid, expired or already used." });
export async function mfaStatus(context: Context) {
  const row = await context.db.MfaCredential.findOne({ userId: context.user!.id })
    .lean()
    .exec()
    .then((row) => (row ? toEntity(row) : null));
  return {
    enrolled: Boolean(row?.secretCipher),
    required: requiresMfa({ ...context.user!, mfaEnrolled: Boolean(row?.secretCipher) }),
    enforcementDisabled: privilegedAccount(context.user!) && localMfaDisabled(),
    verified: Boolean(context.user?.mfaVerified),
    fresh: Boolean(context.user?.mfaFresh),
    configured: /^[a-f0-9]{64}$/i.test(context.integrationEnv.mfaEncryptionKey ?? ""),
  };
}
export async function beginMfa(context: Context, password: string) {
  encryptionKey(context);
  await consumeAuthAttempt(context.db, "mfa-enroll", context.user!.id);
  const user = await context.db.User.findOne({ _id: context.user!.id })
    .lean()
    .orFail(() => new ApiError("UNAUTHORIZED"))
    .exec()
    .then((row) => toEntity(row));
  if (!user.passwordHash || !(await verifyPassword(password, user.passwordHash)))
    throw new ApiError("FORBIDDEN", {
      message: "Re-enter your current password to set up an authenticator.",
    });
  const existing = await context.db.MfaCredential.findOne({ userId: user.id })
    .lean()
    .exec()
    .then((row) => (row ? toEntity(row) : null));
  if (
    existing?.secretCipher &&
    (!context.user!.mfaVerified ||
      !context.user!.mfaFresh ||
      context.user!.mfaVersion !== existing.version)
  )
    throw new ApiError("FORBIDDEN", {
      message: "Verify with your authenticator or a recovery code before replacing it.",
    });
  if (!context.sessionToken) throw new ApiError("UNAUTHORIZED");
  const secret = generateSecret();
  const data = {
    pendingCipher: encryptMfaSecret(context, secret),
    pendingSession: digest(context.sessionToken),
    pendingUntil: new Date(Date.now() + 10 * 60_000),
  };
  if (existing) {
    const claimed = await context.db.MfaCredential.updateOne(
      { _id: existing.id, version: existing.version },
      { $set: data },
    ).exec();
    if (claimed.modifiedCount !== 1)
      throw new ApiError("CONFLICT", { message: "Authenticator settings changed. Try again." });
  } else await context.db.MfaCredential.create({ userId: user.id, recoveryHashes: [], ...data });
  return {
    secret,
    uri: generateURI({ issuer: "Alumni Tracking", label: user.email, secret }),
    expiresInSeconds: 600,
  };
}
export async function confirmMfa(context: Context, code: string) {
  await consumeAuthAttempt(context.db, "mfa-code", context.user!.id);
  const row = await context.db.MfaCredential.findOne({ userId: context.user!.id })
    .lean()
    .exec()
    .then((row) => (row ? toEntity(row) : null));
  if (
    !row?.pendingCipher ||
    !row.pendingUntil ||
    row.pendingUntil <= new Date() ||
    row.pendingSession !== digest(context.sessionToken ?? "")
  )
    throw failed();
  const result = await verify({
    secret: decrypt(context, row.pendingCipher),
    token: code,
    epochTolerance: 30,
  });
  if (!result.valid || !("timeStep" in result)) throw failed();
  const recoveryCodes = Array.from({ length: 10 }, () => randomBytes(16).toString("hex"));
  const version = randomUUID();
  const rotated = await authorizationTransaction(context.db, async (tx) => {
    const claimed = await tx.MfaCredential.updateOne(
      {
        _id: row.id,
        pendingCipher: row.pendingCipher,
        pendingSession: row.pendingSession,
        pendingUntil: { $gt: new Date() },
      },
      {
        $set: {
          secretCipher: row.pendingCipher,
          version: version,
          lastStep: result.timeStep,
          recoveryHashes: recoveryCodes.map(digest),
          pendingCipher: null,
          pendingSession: null,
          pendingUntil: null,
        },
      },
    ).exec();
    if (claimed.modifiedCount !== 1) throw failed();
    const session = await rotateSession(tx, context, { version, verifiedAt: new Date() }, true);
    await writeAudit(tx, {
      actor: context.user,
      action: "auth.mfa.enrolled",
      entity: "user",
      entityId: context.user!.id,
      summary: "Enrolled authenticator, replaced recovery codes and revoked other sessions",
    });
    return session;
  });
  context.onSessionRotation?.(rotated);
  return {
    recoveryCodes,
    ...(context.onSessionRotation
      ? {}
      : { sessionToken: rotated.token, expiresAt: rotated.expiresAt.toISOString() }),
  };
}
export async function verifyMfa(context: Context, code: string) {
  await consumeAuthAttempt(context.db, "mfa-code", context.user!.id);
  const row = await context.db.MfaCredential.findOne({ userId: context.user!.id })
    .lean()
    .exec()
    .then((row) => (row ? toEntity(row) : null));
  const session = await context.db.Session.findOne({
    token: context.sessionStorageToken ?? context.sessionToken ?? "",
  })
    .lean()
    .exec()
    .then((row) => (row ? toEntity(row) : null));
  if (
    !row?.secretCipher ||
    !session ||
    session.userId !== context.user!.id ||
    session.expiresAt <= new Date() ||
    session.createdAt.getTime() < Date.now() - 10 * 60_000
  )
    throw new ApiError("FORBIDDEN", {
      message: "Sign in again before verifying your authenticator.",
    });
  const recovery = /^[a-f0-9]{32}$/i.test(code);
  const codeHash = digest(code.toLowerCase());
  const result = recovery
    ? null
    : await verify({
        secret: decrypt(context, row.secretCipher),
        token: code,
        epochTolerance: 30,
        afterTimeStep: row.lastStep,
      });
  const usedStep =
    result && "timeStep" in result && typeof result.timeStep === "number" ? result.timeStep : null;
  if (recovery ? !row.recoveryHashes.includes(codeHash) : !result?.valid || !("timeStep" in result))
    throw failed();
  const rotated = await authorizationTransaction(context.db, async (tx) => {
    const claimed = await tx.MfaCredential.updateOne(
      {
        _id: row.id,
        version: row.version,
        ...(recovery ? { recoveryHashes: row.recoveryHashes } : { lastStep: row.lastStep }),
      },
      {
        $set: recovery
          ? { recoveryHashes: row.recoveryHashes.filter((hash) => hash !== codeHash) }
          : { lastStep: usedStep ?? row.lastStep },
      },
    ).exec();
    if (claimed.modifiedCount !== 1) throw failed();
    const session = await rotateSession(
      tx,
      context,
      { version: row.version, verifiedAt: new Date() },
      false,
    );
    await writeAudit(tx, {
      actor: context.user,
      action: recovery ? "auth.mfa.recovery" : "auth.mfa.verified",
      entity: "user",
      entityId: context.user!.id,
      summary: recovery
        ? "Used a single-use authenticator recovery code"
        : "Verified authenticator",
    });
    return session;
  });
  context.onSessionRotation?.(rotated);
  return {
    ok: true,
    ...(context.onSessionRotation
      ? {}
      : { sessionToken: rotated.token, expiresAt: rotated.expiresAt.toISOString() }),
  };
}
