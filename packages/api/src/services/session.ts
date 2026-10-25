import { accountAccessPending } from "./verification";
import { createHash } from "node:crypto";
import { requiresMfa } from "./mfa-policy";
import { assertPasswordSafe } from "./password-security";
import { consumeAuthAttempt, boundedSetting } from "./throttle";
import type { z } from "zod";
import { signupSchema } from "@Alumni-Tracking-Ss/contracts/auth";
import { formatDisplayName, isAlumniAccount } from "@Alumni-Tracking-Ss/contracts/names";
import { loadUserRoles, authorizationTransaction } from "./authorization";
import type { Database } from "@Alumni-Tracking-Ss/db";
import {
  createSessionToken,
  hashPassword,
  verifyPassword,
  isPermissionKey,
  toEntity,
} from "@Alumni-Tracking-Ss/db";
import { ApiError } from "../http-error";

import type { AuthUser } from "../context";
import { writeAudit } from "../audit";
import { isDatabaseUnavailable } from "../errors";
import { createRegistrationProfile } from "./registration";

const SESSION_DAYS = 7;
export const storedSessionToken = (token: string) =>
  "sha256:" + createHash("sha256").update(token).digest("hex");
let dummyHash: Promise<string> | undefined;

export function publicSignupEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_PUBLIC_SIGNUP === "true";
}

export async function loadAuthUser(db: Database, userId: string): Promise<AuthUser | null> {
  const row = await db.User.findById(userId).lean().exec();
  if (!row || row.status !== "active") return null;
  const user = toEntity(row);
  const credential = await db.MfaCredential.findOne({ userId }).lean().exec();
  const assigned = await loadUserRoles(db, userId);
  const roles = assigned.map((role) => role.key);
  const alumniAccount = isAlumniAccount({ roles });
  const alumniPhoto =
    !user.image && user.alumniId
      ? await db.Alumni.findOne({ _id: user.alumniId, deletedAt: null }).select("photoUrl").lean()
      : null;
  const image = user.image || alumniPhoto?.photoUrl || null;
  const permissions = [
    ...new Set(
      assigned.flatMap((role) => role.rolePermissions.map(({ permission }) => permission.key)),
    ),
  ].filter(isPermissionKey);
  return {
    id: user.id,
    name: formatDisplayName({
      name: user.name,
      firstName: user.firstName ?? undefined,
      middleName: user.middleName ?? undefined,
      lastName: user.lastName ?? undefined,
      suffix: user.suffix ?? undefined,
    }),
    email: user.email,
    image: image?.replace(/^\/api\/files\/([a-f\d]{24})$/i, "/api/me/files/$1?preview=1") ?? null,
    firstName: user.firstName ?? undefined,
    middleName: user.middleName ?? undefined,
    lastName: user.lastName ?? undefined,
    suffix: user.suffix ?? undefined,
    alumniId: user.alumniId ?? null,
    isAlumni: alumniAccount,
    status: user.status,
    needsProfileCompletion: accountAccessPending(user) || (alumniAccount && !user.alumniId),
    needsPassword: !user.passwordHash,
    roles,
    permissions,
    mfaRequired: requiresMfa({ roles, permissions }),
    mfaEnrolled: Boolean(credential?.secretCipher),
    mfaVersion: credential?.version,
    mfaVerified: false,
  };
}

export async function loadAuthUserFromToken(db: Database, token: string | null) {
  if (!token || token.startsWith("sha256:")) {
    return null;
  }

  let session;
  try {
    const row = await db.Session.findOne({ token: { $in: [storedSessionToken(token), token] } })
      .lean()
      .exec();
    session = row ? toEntity(row) : null;
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return null;
    }
    throw error;
  }

  const lastSeen = session?.lastSeenAt ?? session?.createdAt;
  const idleMs = boundedSetting(process.env.SESSION_IDLE_MINUTES, 30, 1440) * 60_000;
  if (
    !session ||
    session.expiresAt.getTime() <= Date.now() ||
    (lastSeen && lastSeen.getTime() <= Date.now() - idleMs)
  ) {
    if (session) {
      await db.Session.deleteOne({ _id: session.id })
        .exec()
        .catch(() => undefined);
    }
    return null;
  }
  if (session.token === token) {
    const migrated = await db.Session.updateOne(
      { _id: session.id, token },
      { $set: { token: storedSessionToken(token) } },
    ).exec();
    if (
      migrated.modifiedCount !== 1 &&
      !(await db.Session.findOne({ token: storedSessionToken(token) })
        .lean()
        .exec())
    )
      return null;
  }
  if (lastSeen && lastSeen.getTime() < Date.now() - 60_000)
    await db.Session.updateOne({ _id: session.id }, { $set: { lastSeenAt: new Date() } }).exec();

  const user = await loadAuthUser(db, session.userId);
  if (user)
    user.mfaVerified = Boolean(
      user.mfaEnrolled && session.mfaVersion === user.mfaVersion && session.mfaVerifiedAt,
    );
  if (user)
    user.mfaFresh = Boolean(
      user.mfaVerified &&
      session.mfaVerifiedAt &&
      session.mfaVerifiedAt.getTime() > Date.now() - 5 * 60_000,
    );
  return user;
}

export async function createSession(
  db: Database,
  userId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null; googleVerifiedAt?: Date },
) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.Session.create({
    token: storedSessionToken(token),
    userId,
    expiresAt,
    ipAddress: meta.ipAddress ?? undefined,
    userAgent: meta.userAgent ?? undefined,
    googleVerifiedAt: meta.googleVerifiedAt,
    lastSeenAt: new Date(),
  });
  return { token, expiresAt };
}

export async function destroySession(db: Database, token: string | null) {
  if (!token) {
    return;
  }

  if (token.startsWith("sha256:")) return;
  await db.Session.deleteMany({ token: { $in: [storedSessionToken(token), token] } }).exec();
}

export async function authenticateWithPassword(
  db: Database,
  input: { email: string; password: string; ipAddress?: string | null },
) {
  const attempt = await consumeAuthAttempt(
    db,
    "password-login",
    input.email,
    boundedSetting(process.env.AUTH_ACCOUNT_LIMIT, 5, 100),
    15 * 60_000,
  );
  const row = await db.User.findOne({ email: input.email.trim().toLowerCase() }).lean().exec();
  const user = row ? toEntity(row) : null;
  const stored = user?.passwordHash ?? (await (dummyHash ??= hashPassword(createSessionToken())));
  const valid = await verifyPassword(input.password, stored);
  if (!valid || !user || !user.passwordHash) {
    throw new ApiError("UNAUTHORIZED", { message: "Invalid email or password." });
  }
  if (!user.passwordHash.startsWith("scrypt$v1$")) {
    await db.User.updateOne(
      { _id: user.id, passwordHash: user.passwordHash },
      { $set: { passwordHash: await hashPassword(input.password) } },
    ).exec();
  }

  if (user.status !== "active") {
    throw new ApiError("FORBIDDEN", { message: "This account is disabled." });
  }

  const roleCount = await db.UserRole.countDocuments({ userId: user.id }).exec();
  if (roleCount === 0) {
    throw new ApiError("FORBIDDEN", { message: "No role is assigned to this account." });
  }
  await db.AuthThrottle.updateOne(
    { key: attempt.key, count: { $gt: 0 } },
    { $inc: { count: -1 } },
  ).exec();

  await writeAudit(db, {
    actor: user,
    action: "auth.login",
    entity: "user",
    entityId: user.id,
    summary: "Signed in with email and password",
    ipAddress: input.ipAddress,
  });

  return user;
}

export async function registerUser(
  db: Database,
  input: z.infer<typeof signupSchema> & { ipAddress?: string | null },
) {
  if (!publicSignupEnabled())
    throw new ApiError("FORBIDDEN", {
      message: "Public registration is disabled. Contact an administrator for access.",
    });
  const { ipAddress, ...raw } = input;
  const profile = signupSchema.parse(raw);
  await assertPasswordSafe(profile.password);
  const email = profile.email.trim().toLowerCase();
  const passwordHash = await hashPassword(profile.password);
  return authorizationTransaction(db, async (tx) => {
    if (await tx.User.findOne({ email }).lean().exec())
      throw new ApiError("CONFLICT", { message: "An account with that email already exists." });
    const role = await tx.Role.findOne({ key: "viewer" }).lean().exec();
    if (!role) throw new ApiError("INTERNAL_SERVER_ERROR", { message: "Roles are not seeded." });
    const { firstName, middleName, lastName, suffix, phoneNumber, gender, facebookAccount } =
      profile;
    const alumni = await createRegistrationProfile(tx, { ...profile, email });
    const created = await tx.User.create({
      firstName,
      middleName,
      lastName,
      suffix,
      name: formatDisplayName(profile),
      verificationRequired: true,
      phoneNumber,
      gender,
      facebookAccount,
      email,
      passwordHash,
      status: "active",
      alumniId: toEntity(alumni.toObject()).id,
    });
    const user = toEntity(created.toObject());
    await tx.UserRole.create({ userId: user.id, roleId: role._id });
    await writeAudit(tx, {
      actor: user,
      action: "auth.signup",
      entity: "user",
      entityId: user.id,
      summary: `Registered Alumni account ${JSON.stringify(user.name)} (${user.email}); created linked student profile ${profile.studentNumber}`,
      ipAddress,
    });
    return user;
  });
}

export async function upsertGoogleUser(
  db: Database,
  input: { email: string; name: string; image?: string | null },
) {
  const email = input.email.trim().toLowerCase();
  const existingRow = await db.User.findOne({ email }).lean().exec();
  if (existingRow) {
    const existing = toEntity(existingRow);
    if (existing.status !== "active")
      throw new ApiError("FORBIDDEN", { message: "This account is disabled." });
    assertGoogleLinkAllowed(existing);
    // Provider names and photos initialize new accounts; later sign-ins preserve account edits.
    const updated = await db.User.findOneAndUpdate(
      {
        _id: existing.id,
        status: "active",
        passwordHash: existing.passwordHash,
        emailVerified: existing.emailVerified,
      },
      {
        $set: {
          emailVerified: true,
          verificationRequired: existing.verificationRequired || !existing.passwordHash,
          needsProfileCompletion: existing.needsProfileCompletion || !existing.passwordHash,
        },
      },
      { returnDocument: "after" },
    )
      .lean()
      .exec();
    if (!updated) throw new ApiError("CONFLICT", { message: "Account changed. Sign in again." });
    return toEntity(updated);
  }
  if (!publicSignupEnabled())
    throw new ApiError("FORBIDDEN", {
      message: "Ask an administrator to create your account before using Google sign-in.",
    });
  try {
    return await authorizationTransaction(db, async (tx) => {
      const role = await tx.Role.findOne({ key: "viewer" }).lean().exec();
      if (!role) throw new ApiError("INTERNAL_SERVER_ERROR", { message: "Roles are not seeded." });
      const created = await tx.User.create({
        name: input.name,
        email,
        image: input.image ?? null,
        passwordHash: null,
        needsProfileCompletion: true,
        verificationRequired: true,
        emailVerified: true,
        status: "active",
      });
      const user = toEntity(created.toObject());
      await tx.UserRole.create({ userId: user.id, roleId: role._id });
      return user;
    });
  } catch (error) {
    if ((error instanceof ApiError && error.code === "CONFLICT") || isDuplicateEmail(error)) {
      const row = await db.User.findOne({ email }).lean().exec();
      if (row?.status === "active") {
        assertGoogleLinkAllowed(row);
        return toEntity(row);
      }
    }
    throw error;
  }
}
function isDuplicateEmail(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

// Do not activate a password/phone chosen by someone who reserved another
// person's email address before that email address was confirmed.
function assertGoogleLinkAllowed(user: {
  verificationRequired?: boolean;
  emailVerified?: boolean;
  passwordHash?: string | null;
}) {
  if (user.verificationRequired && !user.emailVerified && user.passwordHash)
    throw new ApiError("FORBIDDEN", {
      message:
        "Confirm the pending registration email and sign in with its password before linking Google.",
    });
}
