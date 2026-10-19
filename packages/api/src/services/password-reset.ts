import { randomBytes } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { hashPassword } from "@Alumni-Tracking-Ss/db";
import type { Context } from "../context";
import { digest } from "./mfa";
import { consumeAuthAttempt } from "./throttle";
import { assertPasswordSafe } from "./password-security";
import { authorizationTransaction } from "./authorization";
import { sendEmail } from "../integrations/email";
import { isIntegrationEnabled } from "../integrations/registry";
import { writeAudit } from "../audit";

export async function requestPasswordReset(context: Context, email: string) {
  await consumeAuthAttempt(context.db, "password-reset-request", email, 3);
  const user = await context.db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (
    user?.status === "active" &&
    user.emailVerified &&
    user.passwordHash &&
    context.integrationEnv.smtpUrl?.startsWith("https://") &&
    context.integrationEnv.webOrigin &&
    (await isIntegrationEnabled(context.db, "email"))
  ) {
    const token = randomBytes(32).toString("hex");
    await context.db.passwordReset.create({
      data: {
        tokenHash: digest(token),
        userId: user.id,
        passwordVersion: digest(user.passwordHash),
        expiresAt: new Date(Date.now() + 15 * 60_000),
        consumedAt: null,
      },
    });
    const url = new URL("/reset-password", context.integrationEnv.webOrigin);
    url.hash = new URLSearchParams({ token }).toString();
    try {
      await sendEmail(context.integrationEnv, {
        to: user.email,
        subject: "Reset your Alumni Tracking password",
        text: `Reset your password within 15 minutes: ${url.toString()}\nIf you did not request this, ignore this message. Your authenticator remains required.`,
      });
    } catch {
      /* Uniform response; never expose account or gateway details. */
    }
  }
  return {
    ok: true,
    message:
      "If an eligible account exists and email delivery is configured, a reset link will be sent.",
  };
}
export async function resetPassword(context: Context, token: string, password: string) {
  const tokenHash = digest(token);
  await consumeAuthAttempt(context.db, "password-reset-token", tokenHash);
  const row = await context.db.passwordReset.findUnique({ where: { tokenHash } });
  const invalid = () =>
    new ORPCError("BAD_REQUEST", {
      message: "This reset link is invalid, expired or already used. Request a new link.",
    });
  if (!row || row.consumedAt || row.expiresAt <= new Date()) throw invalid();
  const user = await context.db.user.findUnique({ where: { id: row.userId } });
  if (
    !user?.passwordHash ||
    user.status !== "active" ||
    !user.emailVerified ||
    digest(user.passwordHash) !== row.passwordVersion
  )
    throw invalid();
  await assertPasswordSafe(password);
  const passwordHash = await hashPassword(password);
  await authorizationTransaction(context.db, async (tx) => {
    const used = await tx.passwordReset.updateMany({
      where: {
        id: row.id,
        OR: [{ consumedAt: null }, { consumedAt: { isSet: false } }],
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (used.count !== 1) throw invalid();
    const updated = await tx.user.updateMany({
      where: {
        id: user.id,
        passwordHash: user.passwordHash,
        status: "active",
        emailVerified: true,
      },
      data: { passwordHash },
    });
    if (updated.count !== 1) throw invalid();
    await tx.session.deleteMany({ where: { userId: user.id } });
    await writeAudit(tx, {
      actorId: user.id,
      action: "auth.password.reset",
      entity: "user",
      entityId: user.id,
      summary: "Reset password using email proof and revoked all sessions; authenticator retained",
    });
  });
  return { ok: true };
}
