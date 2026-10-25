import { toEntity } from "@Alumni-Tracking-Ss/db";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { ApiError } from "../http-error";
import { hashPassword } from "@Alumni-Tracking-Ss/db";
import type { Context, IntegrationEnv } from "../context";
import { sendEmail } from "../integrations/email";
import { checkPhoneCode, sendPhoneCode, smsConfigured } from "../integrations/sms";
import { isIntegrationEnabled } from "../integrations/registry";
import { writeAudit } from "../audit";
import { authorizationTransaction } from "./authorization";
import { assertPasswordSafe } from "./password-security";
import { rotateSession } from "./session-rotation";
import { contactVerificationPolicy } from "./contact-policy";
import { isAlumniAccount } from "@Alumni-Tracking-Ss/contracts/names";

export type VerificationKind = "email" | "phone";
const VALID_MS = 10 * 60_000;
export const GOOGLE_FRESH_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;

export function accountAccessPending(user: {
  needsProfileCompletion?: boolean;
  passwordHash?: string | null;
  verificationRequired?: boolean;
  emailVerified?: boolean;
  phoneVerified?: boolean;
}) {
  const policy = contactVerificationPolicy();
  return Boolean(
    user.needsProfileCompletion ||
    !user.passwordHash ||
    (user.verificationRequired &&
      ((policy.email && !user.emailVerified) || (policy.phone && !user.phoneVerified))),
  );
}

function codeDigest(env: IntegrationEnv, nonce: string, code: string) {
  if (!env.verificationSecret || env.verificationSecret.length < 32)
    throw new ApiError("SERVICE_UNAVAILABLE", {
      message: "Account verification is not configured. Contact an administrator.",
    });
  return createHmac("sha256", env.verificationSecret).update(`${nonce}:${code}`).digest("hex");
}

export async function verificationStatus(context: Context) {
  const policy = contactVerificationPolicy();
  const user = await context.db.User.findOne({ _id: context.user!.id })
    .lean()
    .orFail(() => new ApiError("UNAUTHORIZED"))
    .exec()
    .then((row) => toEntity(row));
  const session = context.sessionToken
    ? await context.db.Session.findOne({
        token: context.sessionStorageToken ?? context.sessionToken,
      })
        .lean()
        .exec()
        .then((row) => (row ? toEntity(row) : null))
    : null;
  const secretReady = Boolean(
    context.integrationEnv.verificationSecret &&
    context.integrationEnv.verificationSecret.length >= 32,
  );
  const academicNeeded = isAlumniAccount(context.user!) && !user.alumniId;
  return {
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    phoneVerified: Boolean(user.phoneVerified),
    phoneNumber: user.phoneNumber ?? "",
    gender: user.gender ?? "",
    facebookAccount: user.facebookAccount ?? "",
    profileNeeded: Boolean(user.needsProfileCompletion),
    academicNeeded,
    passwordNeeded: !user.passwordHash,
    emailNeeded: Boolean(policy.email && user.verificationRequired && !user.emailVerified),
    phoneNeeded: Boolean(policy.phone && user.verificationRequired && !user.phoneVerified),
    googleFresh: Boolean(
      session?.userId === user.id &&
      session.googleVerifiedAt &&
      session.googleVerifiedAt.getTime() > Date.now() - GOOGLE_FRESH_MS,
    ),
    canSendEmail:
      secretReady &&
      Boolean(context.integrationEnv.smtpUrl?.startsWith("https://")) &&
      (await isIntegrationEnabled(context.db, "email")),
    canSendPhone: secretReady && smsConfigured(context.integrationEnv),
    ready: !academicNeeded && !accountAccessPending(user),
  };
}

export async function startVerification(context: Context, kind: VerificationKind) {
  const { db, integrationEnv: env } = context;
  const user = await db.User.findOne({ _id: context.user!.id })
    .lean()
    .orFail(() => new ApiError("UNAUTHORIZED"))
    .exec()
    .then((row) => toEntity(row));
  const target = kind === "email" ? user.email : user.phoneNumber;
  if (
    (kind === "phone" && !user.verificationRequired) ||
    (kind === "email" ? user.emailVerified : user.phoneVerified)
  )
    throw new ApiError("BAD_REQUEST", { message: "This contact is already verified." });
  if (!target || (kind === "phone" && !/^\+[1-9]\d{7,14}$/.test(target)))
    throw new ApiError("BAD_REQUEST", {
      message: "Save a phone number with its country code first.",
    });
  const nonce = randomBytes(32).toString("hex");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const digest = codeDigest(env, nonce, code);
  if (
    kind === "email" &&
    (!env.smtpUrl?.startsWith("https://") || !(await isIntegrationEnabled(db, "email")))
  )
    throw new ApiError("SERVICE_UNAVAILABLE", {
      message: "Email verification delivery is unavailable. Contact an administrator.",
    });
  if (kind === "phone" && !smsConfigured(env))
    throw new ApiError("SERVICE_UNAVAILABLE", {
      message: "Phone verification delivery is not configured. Contact an administrator.",
    });
  const now = new Date();
  const initial = () =>
    db.VerificationChallenge.findOneAndUpdate(
      { userId: user.id, kind },
      {
        $setOnInsert: {
          userId: user.id,
          kind,
          target,
          nonce: "",
          expiresAt: new Date(0),
          sentAt: new Date(0),
          consumedAt: null,
          attempts: 0,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: "after", timestamps: false },
    )
      .lean()
      .exec();
  let previousRow;
  try {
    previousRow = await initial();
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 11000)
      previousRow = await initial();
    else throw error;
  }
  if (!previousRow)
    throw new ApiError("CONFLICT", { message: "A verification request is already in progress." });
  const previous = toEntity(previousRow);
  if (previous.sentAt.getTime() > now.getTime() - 60_000)
    throw new ApiError("TOO_MANY_REQUESTS", {
      message: "Wait 60 seconds before requesting another code.",
    });
  if (previous.expiresAt > now && previous.attempts >= MAX_ATTEMPTS)
    throw new ApiError("TOO_MANY_REQUESTS", {
      message: "Too many incorrect codes. Wait until the current code expires before retrying.",
    });
  const claimed = await db.VerificationChallenge.updateOne(
    { _id: previous.id, updatedAt: previous.updatedAt },
    {
      $set: {
        target: target,
        nonce: nonce,
        codeHash: kind === "email" ? digest : null,
        providerSid: null,
        attempts: previous.expiresAt > now ? previous.attempts : 0,
        expiresAt: new Date(now.getTime() + VALID_MS),
        sentAt: now,
        consumedAt: null,
        updatedAt: new Date(Math.max(now.getTime(), previous.updatedAt.getTime() + 1)),
      },
    },
  ).exec();
  if (claimed.modifiedCount !== 1)
    throw new ApiError("TOO_MANY_REQUESTS", {
      message: "A verification request is already in progress.",
    });
  try {
    if (kind === "email") {
      await sendEmail(env, {
        to: target,
        subject: "Confirm your Alumni Tracking account",
        text: `Your email confirmation code is ${code}. It expires in 10 minutes. If you did not request this, ignore this message.`,
      });
    } else {
      const providerSid = await sendPhoneCode(env, target);
      await db.VerificationChallenge.updateOne(
        { _id: previous.id, nonce },
        { $set: { providerSid: providerSid } },
      ).exec();
    }
  } catch {
    throw new ApiError("SERVICE_UNAVAILABLE", {
      message: "The code could not be delivered. Please wait 60 seconds and try again.",
    });
  }
  return { ok: true, expiresInSeconds: 600, resendAfterSeconds: 60 };
}

export async function confirmVerification(context: Context, kind: VerificationKind, code: string) {
  const { db, integrationEnv: env } = context;
  const challenge = await db.VerificationChallenge.findOne({ userId: context.user!.id, kind })
    .lean()
    .exec()
    .then((row) => (row ? toEntity(row) : null));
  const now = new Date();
  if (
    !challenge ||
    challenge.consumedAt ||
    challenge.expiresAt <= now ||
    challenge.attempts >= MAX_ATTEMPTS
  )
    throw new ApiError("BAD_REQUEST", {
      message: "The code expired, was used, or has too many failed attempts. Request a new code.",
    });
  const attempt = await db.VerificationChallenge.updateOne(
    {
      _id: challenge.id,
      nonce: challenge.nonce,
      consumedAt: null,
      expiresAt: { $gt: now },
      attempts: { $lt: MAX_ATTEMPTS },
    },
    { $inc: { attempts: 1 } },
  ).exec();
  if (attempt.modifiedCount !== 1)
    throw new ApiError("BAD_REQUEST", { message: "This code is no longer available." });
  const expected = challenge.codeHash ? Buffer.from(challenge.codeHash, "hex") : Buffer.alloc(0);
  const supplied = Buffer.from(codeDigest(env, challenge.nonce, code), "hex");
  const valid =
    kind === "email"
      ? expected.length === supplied.length && timingSafeEqual(expected, supplied)
      : Boolean(
          challenge.providerSid &&
          (await checkPhoneCode(env, challenge.providerSid, challenge.target, code)),
        );
  if (!valid) throw new ApiError("BAD_REQUEST", { message: "The verification code is incorrect." });
  return authorizationTransaction(db, async (tx) => {
    const consumed = await tx.VerificationChallenge.updateOne(
      {
        _id: challenge.id,
        nonce: challenge.nonce,
        consumedAt: null,
        expiresAt: { $gt: new Date() },
        attempts: { $lte: MAX_ATTEMPTS },
      },
      { $set: { consumedAt: new Date(), codeHash: null } },
    ).exec();
    if (consumed.modifiedCount !== 1)
      throw new ApiError("CONFLICT", { message: "This verification code has already been used." });
    const updated = await tx.User.updateOne(
      {
        _id: context.user!.id,
        status: "active",
        ...(kind === "email" ? { email: challenge.target } : { phoneNumber: challenge.target }),
      },
      { $set: kind === "email" ? { emailVerified: true } : { phoneVerified: true } },
    ).exec();
    if (updated.modifiedCount !== 1)
      throw new ApiError("CONFLICT", {
        message: "Your contact details changed. Request another code.",
      });
    await writeAudit(tx, {
      actor: context.user,
      action: `auth.${kind}_verified`,
      entity: "user",
      entityId: context.user!.id,
      summary: `Confirmed ${kind} ownership for ${JSON.stringify(challenge.target)}`,
    });
    return { ok: true };
  });
}

export async function createGooglePassword(context: Context, password: string) {
  await assertPasswordSafe(password);
  const passwordHash = await hashPassword(password);
  const rotated = await authorizationTransaction(context.db, async (tx) => {
    const fresh = await tx.Session.updateOne(
      {
        token: context.sessionStorageToken ?? context.sessionToken ?? "",
        userId: context.user!.id,
        expiresAt: { $gt: new Date() },
        googleVerifiedAt: { $gt: new Date(Date.now() - GOOGLE_FRESH_MS) },
      },
      { $set: { googleVerifiedAt: null } },
    ).exec();
    if (fresh.modifiedCount !== 1)
      throw new ApiError("FORBIDDEN", {
        message: "Verify with Google again before creating your password.",
      });
    const claimed = await tx.User.updateOne(
      {
        _id: context.user!.id,
        status: "active",
        $or: [{ passwordHash: null }, { passwordHash: { $exists: false } }],
      },
      { $set: { passwordHash: passwordHash, verificationRequired: true } },
    ).exec();
    if (claimed.modifiedCount !== 1)
      throw new ApiError("CONFLICT", {
        message: "A password is already set. Use Change password with your current password.",
      });
    const session = await rotateSession(tx, context, undefined, true);
    await writeAudit(tx, {
      actor: context.user,
      action: "auth.password.create",
      entity: "user",
      entityId: context.user!.id,
      summary: "Created required password after recent Google verification",
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
