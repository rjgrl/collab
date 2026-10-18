import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { hashPassword } from "@Alumni-Tracking-Ss/db";
import type { Context, IntegrationEnv } from "../context";
import { sendEmail } from "../integrations/email";
import { checkPhoneCode, sendPhoneCode, smsConfigured } from "../integrations/sms";
import { isIntegrationEnabled } from "../integrations/registry";
import { writeAudit } from "../audit";
import { authorizationTransaction } from "./authorization";

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
  return Boolean(
    user.needsProfileCompletion ||
    user.passwordHash === null ||
    (user.verificationRequired && (!user.emailVerified || !user.phoneVerified)),
  );
}

function codeDigest(env: IntegrationEnv, nonce: string, code: string) {
  if (!env.verificationSecret || env.verificationSecret.length < 32)
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: "Account verification is not configured. Contact an administrator.",
    });
  return createHmac("sha256", env.verificationSecret).update(`${nonce}:${code}`).digest("hex");
}

export async function verificationStatus(context: Context) {
  const user = await context.db.user.findUniqueOrThrow({ where: { id: context.user!.id } });
  const session = context.sessionToken
    ? await context.db.session.findUnique({ where: { token: context.sessionToken } })
    : null;
  const secretReady = Boolean(
    context.integrationEnv.verificationSecret &&
    context.integrationEnv.verificationSecret.length >= 32,
  );
  return {
    email: user.email,
    phoneNumber: user.phoneNumber ?? "",
    gender: user.gender ?? "",
    facebookAccount: user.facebookAccount ?? "",
    profileNeeded: user.needsProfileCompletion,
    passwordNeeded: user.passwordHash === null,
    emailNeeded: user.verificationRequired && !user.emailVerified,
    phoneNeeded: user.verificationRequired && !user.phoneVerified,
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
    ready: !accountAccessPending(user),
  };
}

export async function startVerification(context: Context, kind: VerificationKind) {
  const { db, integrationEnv: env } = context;
  const user = await db.user.findUniqueOrThrow({ where: { id: context.user!.id } });
  const target = kind === "email" ? user.email : user.phoneNumber;
  if (!user.verificationRequired || (kind === "email" ? user.emailVerified : user.phoneVerified))
    throw new ORPCError("BAD_REQUEST", { message: "This contact is already verified." });
  if (!target || (kind === "phone" && !/^\+[1-9]\d{7,14}$/.test(target)))
    throw new ORPCError("BAD_REQUEST", {
      message: "Save a phone number with its country code first.",
    });
  const nonce = randomBytes(32).toString("hex");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const digest = codeDigest(env, nonce, code);
  if (
    kind === "email" &&
    (!env.smtpUrl?.startsWith("https://") || !(await isIntegrationEnabled(db, "email")))
  )
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: "Email verification delivery is unavailable. Contact an administrator.",
    });
  if (kind === "phone" && !smsConfigured(env))
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: "Phone verification delivery is not configured. Contact an administrator.",
    });
  const now = new Date();
  const previous = await db.verificationChallenge.upsert({
    where: { userId_kind: { userId: user.id, kind } },
    update: {},
    create: {
      userId: user.id,
      kind,
      target,
      nonce: "",
      expiresAt: new Date(0),
      sentAt: new Date(0),
      consumedAt: null,
    },
  });
  if (previous.sentAt.getTime() > now.getTime() - 60_000)
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "Wait 60 seconds before requesting another code.",
    });
  if (previous.expiresAt > now && previous.attempts >= MAX_ATTEMPTS)
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "Too many incorrect codes. Wait until the current code expires before retrying.",
    });
  const claimed = await db.verificationChallenge.updateMany({
    where: { id: previous.id, updatedAt: previous.updatedAt },
    data: {
      target,
      nonce,
      codeHash: kind === "email" ? digest : null,
      providerSid: null,
      attempts: previous.expiresAt > now ? previous.attempts : 0,
      expiresAt: new Date(now.getTime() + VALID_MS),
      sentAt: now,
      consumedAt: null,
      updatedAt: new Date(Math.max(now.getTime(), previous.updatedAt.getTime() + 1)),
    },
  });
  if (claimed.count !== 1)
    throw new ORPCError("TOO_MANY_REQUESTS", {
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
      await db.verificationChallenge.updateMany({
        where: { id: previous.id, nonce },
        data: { providerSid },
      });
    }
  } catch {
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: "The code could not be delivered. Please wait 60 seconds and try again.",
    });
  }
  return { ok: true, expiresInSeconds: 600, resendAfterSeconds: 60 };
}

export async function confirmVerification(context: Context, kind: VerificationKind, code: string) {
  const { db, integrationEnv: env } = context;
  const challenge = await db.verificationChallenge.findUnique({
    where: { userId_kind: { userId: context.user!.id, kind } },
  });
  const now = new Date();
  if (
    !challenge ||
    challenge.consumedAt ||
    challenge.expiresAt <= now ||
    challenge.attempts >= MAX_ATTEMPTS
  )
    throw new ORPCError("BAD_REQUEST", {
      message: "The code expired, was used, or has too many failed attempts. Request a new code.",
    });
  const attempt = await db.verificationChallenge.updateMany({
    where: {
      id: challenge.id,
      nonce: challenge.nonce,
      consumedAt: null,
      expiresAt: { gt: now },
      attempts: { lt: MAX_ATTEMPTS },
    },
    data: { attempts: { increment: 1 } },
  });
  if (attempt.count !== 1)
    throw new ORPCError("BAD_REQUEST", { message: "This code is no longer available." });
  const expected = challenge.codeHash ? Buffer.from(challenge.codeHash, "hex") : Buffer.alloc(0);
  const supplied = Buffer.from(codeDigest(env, challenge.nonce, code), "hex");
  const valid =
    kind === "email"
      ? expected.length === supplied.length && timingSafeEqual(expected, supplied)
      : Boolean(
          challenge.providerSid &&
          (await checkPhoneCode(env, challenge.providerSid, challenge.target, code)),
        );
  if (!valid)
    throw new ORPCError("BAD_REQUEST", { message: "The verification code is incorrect." });
  return authorizationTransaction(db, async (tx) => {
    const consumed = await tx.verificationChallenge.updateMany({
      where: {
        id: challenge.id,
        nonce: challenge.nonce,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lte: MAX_ATTEMPTS },
      },
      data: { consumedAt: new Date(), codeHash: null },
    });
    if (consumed.count !== 1)
      throw new ORPCError("CONFLICT", { message: "This verification code has already been used." });
    const updated = await tx.user.updateMany({
      where: {
        id: context.user!.id,
        status: "active",
        ...(kind === "email" ? { email: challenge.target } : { phoneNumber: challenge.target }),
      },
      data: kind === "email" ? { emailVerified: true } : { phoneVerified: true },
    });
    if (updated.count !== 1)
      throw new ORPCError("CONFLICT", {
        message: "Your contact details changed. Request another code.",
      });
    await writeAudit(tx, {
      actorId: context.user!.id,
      action: `auth.${kind}_verified`,
      entity: "user",
      entityId: context.user!.id,
      summary: `Confirmed ${kind} ownership`,
    });
    return { ok: true };
  });
}

export async function createGooglePassword(context: Context, password: string) {
  const passwordHash = await hashPassword(password);
  return authorizationTransaction(context.db, async (tx) => {
    const fresh = await tx.session.updateMany({
      where: {
        token: context.sessionToken ?? "",
        userId: context.user!.id,
        expiresAt: { gt: new Date() },
        googleVerifiedAt: { gt: new Date(Date.now() - GOOGLE_FRESH_MS) },
      },
      data: { googleVerifiedAt: null },
    });
    if (fresh.count !== 1)
      throw new ORPCError("FORBIDDEN", {
        message: "Verify with Google again before creating your password.",
      });
    const claimed = await tx.user.updateMany({
      where: {
        id: context.user!.id,
        status: "active",
        OR: [{ passwordHash: null }, { passwordHash: { isSet: false } }],
      },
      data: { passwordHash, verificationRequired: true },
    });
    if (claimed.count !== 1)
      throw new ORPCError("CONFLICT", {
        message: "A password is already set. Use Change password with your current password.",
      });
    await tx.session.deleteMany({
      where: { userId: context.user!.id, token: { not: context.sessionToken ?? "" } },
    });
    await writeAudit(tx, {
      actorId: context.user!.id,
      action: "auth.password.create",
      entity: "user",
      entityId: context.user!.id,
      summary: "Created required password after recent Google verification",
    });
    return { ok: true };
  });
}
