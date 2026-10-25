import { authSchemas, type AuthInput } from "@Alumni-Tracking-Ss/contracts/auth";
import { contactVerificationPolicy } from "@Alumni-Tracking-Ss/api/services/contact-policy";
import { createRegistrationProfile } from "@Alumni-Tracking-Ss/api/services/registration";
import { isAlumniAccount } from "@Alumni-Tracking-Ss/contracts/names";
import { hashPassword, verifyPassword, toEntity } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { requireAccess, requireUser } from "@Alumni-Tracking-Ss/api/access";
import { writeAudit, describeAuditChanges } from "@Alumni-Tracking-Ss/api/audit";
import { isDatabaseUnavailable } from "@Alumni-Tracking-Ss/api/errors";
import { isIntegrationEnabled } from "@Alumni-Tracking-Ss/api/integrations/registry";
import { verifyRecaptcha } from "@Alumni-Tracking-Ss/api/integrations/recaptcha";
import { authorizationTransaction } from "@Alumni-Tracking-Ss/api/services/authorization";
import { updateAccountNames } from "@Alumni-Tracking-Ss/api/services/account-names";
import { assertPasswordSafe } from "@Alumni-Tracking-Ss/api/services/password-security";
import {
  requestPasswordReset,
  resetPassword,
} from "@Alumni-Tracking-Ss/api/services/password-reset";
import { rotateSession } from "@Alumni-Tracking-Ss/api/services/session-rotation";
import { beginMfa, confirmMfa, mfaStatus, verifyMfa } from "@Alumni-Tracking-Ss/api/services/mfa";
import {
  verificationStatus,
  startVerification,
  confirmVerification,
  createGooglePassword,
} from "@Alumni-Tracking-Ss/api/services/verification";
import {
  authenticateWithPassword,
  createSession,
  destroySession,
  loadAuthUser,
  registerUser,
  publicSignupEnabled,
} from "@Alumni-Tracking-Ss/api/services/session";

async function checkCaptcha(context: Context, input: AuthInput<"login">) {
  if (await isIntegrationEnabled(context.db, "recaptcha")) {
    if (
      !(await verifyRecaptcha(context.integrationEnv, {
        token: input.recaptchaToken,
        fallback: input.recaptchaFallback,
      }))
    )
      throw new ApiError("BAD_REQUEST", { message: "Complete the reCAPTCHA check." });
  }
}
async function sessionResult(context: Context, userId: string) {
  const session = await createSession(context.db, userId, {
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  return {
    user: await loadAuthUser(context.db, userId),
    sessionToken: session.token,
    expiresAt: session.expiresAt.toISOString(),
  };
}
export const authService = {
  async registrationPrograms(context: Context, input: AuthInput<"registrationPrograms">) {
    const p = input ?? { page: 1, pageSize: 20 };
    const departments = await context.db.Department.find({ deletedAt: null })
      .select("_id name")
      .lean();
    const rows = await context.db.Program.find({
      deletedAt: null,
      departmentId: { $in: departments.map((d) => d._id) },
    })
      .sort({ name: 1, _id: 1 })
      .skip((p.page - 1) * p.pageSize)
      .limit(p.pageSize)
      .select("_id code name departmentId")
      .lean();
    return rows.map((row) => {
      const department = departments.find((d) => String(d._id) === String(row.departmentId))!;
      return {
        id: String(row._id),
        code: row.code,
        name: row.name,
        department: { id: String(department._id), name: department.name },
      };
    });
  },
  async config(context: Context, _input: AuthInput<"config">) {
    try {
      const recaptchaEnabled = await isIntegrationEnabled(context.db, "recaptcha");
      const googleEnabled = await isIntegrationEnabled(context.db, "google_auth");
      return {
        signupEnabled: publicSignupEnabled(),
        contactVerification: contactVerificationPolicy(),
        recaptcha: {
          enabled: recaptchaEnabled,
          live: Boolean(
            context.integrationEnv.recaptchaSecretKey && context.integrationEnv.recaptchaSiteKey,
          ),
          siteKey: recaptchaEnabled ? (context.integrationEnv.recaptchaSiteKey ?? null) : null,
        },
        google: {
          enabled:
            googleEnabled &&
            Boolean(
              context.integrationEnv.googleClientId && context.integrationEnv.googleClientSecret,
            ),
        },
      };
    } catch (error) {
      if (!isDatabaseUnavailable(error)) throw error;
      return {
        signupEnabled: publicSignupEnabled(),
        contactVerification: contactVerificationPolicy(),
        recaptcha: { enabled: false, live: false, siteKey: null },
        google: { enabled: false },
      };
    }
  },
  async me(context: Context, _input: AuthInput<"me">) {
    return context.user;
  },
  async login(context: Context, input: AuthInput<"login">) {
    await checkCaptcha(context, input);
    const user = await authenticateWithPassword(context.db, {
      ...input,
      ipAddress: context.ipAddress,
    });
    return sessionResult(context, user.id);
  },
  async signup(context: Context, input: AuthInput<"signup">) {
    await checkCaptcha(context, input);
    const user = await registerUser(context.db, { ...input, ipAddress: context.ipAddress });
    return sessionResult(context, user.id);
  },
  async logout(context: Context, _input: AuthInput<"logout">) {
    await destroySession(context.db, context.sessionToken);
    if (context.user)
      await writeAudit(context.db, {
        actor: context.user,
        action: "auth.logout",
        entity: "user",
        entityId: context.user.id,
        summary: "Signed out",
        ipAddress: context.ipAddress,
      });
    return { ok: true };
  },
  async forgotPassword(context: Context, input: AuthInput<"forgotPassword">) {
    return requestPasswordReset(context, input.email);
  },
  async resetPassword(context: Context, input: AuthInput<"resetPassword">) {
    return resetPassword(context, input.token, input.password);
  },
  async mfaStatus(context: Context, _input: AuthInput<"mfaStatus">) {
    requireUser(context);
    return mfaStatus(context);
  },
  async beginMfa(context: Context, input: AuthInput<"beginMfa">) {
    requireUser(context);
    return beginMfa(context, input.password);
  },
  async confirmMfa(context: Context, input: AuthInput<"confirmMfa">) {
    requireUser(context);
    return confirmMfa(context, input.code);
  },
  async verifyMfa(context: Context, input: AuthInput<"verifyMfa">) {
    requireUser(context);
    return verifyMfa(context, input.code);
  },
  async verificationStatus(context: Context, _input: AuthInput<"verificationStatus">) {
    requireUser(context);
    return verificationStatus(context);
  },
  async sendVerification(context: Context, input: AuthInput<"sendVerification">) {
    requireUser(context);
    return startVerification(context, input.kind);
  },
  async confirmVerification(context: Context, input: AuthInput<"confirmVerification">) {
    requireUser(context);
    return confirmVerification(context, input.kind, input.code);
  },
  async createGooglePassword(context: Context, input: AuthInput<"createGooglePassword">) {
    requireUser(context);
    return createGooglePassword(context, input.password);
  },
  async completeProfile(context: Context, input: AuthInput<"completeProfile">) {
    const actor = requireUser(context);
    if (!actor.needsProfileCompletion) {
      requireAccess(context);
      throw new ApiError("FORBIDDEN", { message: "Edit personal details in Settings → Account." });
    }
    input = authSchemas.completeProfile.input.parse(input);
    await authorizationTransaction(context.db, async (tx) => {
      const user = await tx.User.findById(actor.id)
        .lean()
        .orFail(() => new ApiError("UNAUTHORIZED"))
        .exec()
        .then((row) => toEntity(row));
      const { firstName, middleName, lastName, suffix, phoneNumber, gender, facebookAccount } =
        input;
      if (isAlumniAccount(actor) && !user.alumniId) {
        const alumni = await createRegistrationProfile(tx, { ...input, email: user.email });
        const linked = await tx.User.updateOne(
          { _id: actor.id, status: "active", alumniId: null },
          { $set: { alumniId: alumni._id } },
        );
        if (linked.modifiedCount !== 1)
          throw new ApiError("CONFLICT", {
            message: "Account link changed. Reload before completing your profile.",
          });
      }
      await updateAccountNames(
        tx,
        actor.id,
        { firstName, middleName, lastName, suffix },
        {
          phoneNumber,
          gender,
          facebookAccount,
          needsProfileCompletion: false,
          ...(user.phoneNumber !== input.phoneNumber ? { phoneVerified: false } : {}),
        },
      );
      if (user.phoneNumber !== phoneNumber)
        await tx.VerificationChallenge.deleteMany({ userId: actor.id, kind: "phone" }).exec();
      await writeAudit(tx, {
        actor,
        action: "auth.profile.complete",
        entity: "user",
        entityId: actor.id,
        summary: `Completed account profile for ${JSON.stringify(user.name)} (${user.email}): ${describeAuditChanges(user, input)}`,
      });
    });
    return { ok: true };
  },
  async updateProfile(context: Context, input: AuthInput<"updateProfile">) {
    const actor = requireAccess(context);
    const { firstName, middleName, lastName, suffix, ...contact } =
      authSchemas.updateProfile.input.parse(input);
    await authorizationTransaction(context.db, async (tx) => {
      const before = await tx.User.findById(actor.id).lean().orFail();
      const phoneChanged =
        contact.phoneNumber !== undefined && contact.phoneNumber !== before.phoneNumber;
      await updateAccountNames(
        tx,
        actor.id,
        { firstName, middleName, lastName, suffix },
        {
          ...contact,
          ...(phoneChanged ? { phoneVerified: false } : {}),
        },
      );
      if (phoneChanged)
        await tx.VerificationChallenge.deleteMany({ userId: actor.id, kind: "phone" }).exec();
      await writeAudit(tx, {
        actor,
        action: "auth.profile.update",
        entity: "user",
        entityId: actor.id,
        summary: `Updated own account profile: ${describeAuditChanges(before, input)}`,
        ipAddress: context.ipAddress,
      });
    });
    return { ok: true };
  },
  async changePassword(context: Context, input: AuthInput<"changePassword">) {
    const actor = requireAccess(context);
    await assertPasswordSafe(input.password);
    const passwordHash = await hashPassword(input.password);
    const rotated = await authorizationTransaction(context.db, async (tx) => {
      const user = await tx.User.findById(actor.id).lean().exec();
      if (!user?.passwordHash || !(await verifyPassword(input.currentPassword, user.passwordHash)))
        throw new ApiError("FORBIDDEN", {
          message: "Current password is incorrect or password sign-in is not configured.",
        });
      const changed = await tx.User.updateOne(
        { _id: actor.id, passwordHash: user.passwordHash, status: "active" },
        { $set: { passwordHash } },
      ).exec();
      if (changed.modifiedCount !== 1)
        throw new ApiError("CONFLICT", { message: "Account changed. Sign in again." });
      const session = await rotateSession(tx, context, undefined, true);
      await writeAudit(tx, {
        actor,
        action: "auth.password",
        entity: "user",
        entityId: actor.id,
        summary: "Changed password and revoked other sessions",
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
  },
};
