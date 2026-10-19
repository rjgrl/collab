import { accountAccessPending } from "./verification";
import { createHash } from "node:crypto";
import { requiresMfa } from "./mfa-policy";
import { assertPasswordSafe } from "./password-security";
import { consumeAuthAttempt, boundedSetting } from "./throttle";
import type { z } from "zod";
import { signupSchema } from "../validation";
import type { Database } from "@Alumni-Tracking-Ss/db";
import {
  createSessionToken,
  hashPassword,
  verifyPassword,
  isPermissionKey,
} from "@Alumni-Tracking-Ss/db";
import { ORPCError } from "@orpc/server";

import type { AuthUser } from "../context";
import { writeAudit } from "../audit";
import { isDatabaseUnavailable } from "../errors";

const SESSION_DAYS = 7;
export const storedSessionToken = (token: string) =>
  "sha256:" + createHash("sha256").update(token).digest("hex");
let dummyHash: Promise<string> | undefined;

export function publicSignupEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_PUBLIC_SIGNUP === "true";
}

export async function loadAuthUser(db: Database, userId: string): Promise<AuthUser | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      mfaCredential: true,
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  });

  if (!user || user.status !== "active") {
    return null;
  }

  const roles = user.userRoles.map((item) => item.role.key);
  const permissions = [
    ...new Set(
      user.userRoles.flatMap((item) =>
        item.role.rolePermissions.map((rolePermission) => rolePermission.permission.key),
      ),
    ),
  ].filter(isPermissionKey);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    status: user.status,
    needsProfileCompletion: accountAccessPending(user),
    needsPassword: user.passwordHash === null,
    roles,
    permissions,
    mfaRequired: requiresMfa({
      roles,
      permissions,
      mfaEnrolled: Boolean(user.mfaCredential?.secretCipher),
    }),
    mfaEnrolled: Boolean(user.mfaCredential?.secretCipher),
    mfaVersion: user.mfaCredential?.version,
    mfaVerified: false,
  };
}

export async function loadAuthUserFromToken(db: Database, token: string | null) {
  if (!token || token.startsWith("sha256:")) {
    return null;
  }

  let session;
  try {
    session = await db.session.findUnique({ where: { token: storedSessionToken(token) } });
    if (!session) session = await db.session.findUnique({ where: { token } });
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
      await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    }
    return null;
  }
  if (session.token === token) {
    const migrated = await db.session.updateMany({
      where: { id: session.id, token },
      data: { token: storedSessionToken(token) },
    });
    if (
      migrated.count !== 1 &&
      !(await db.session.findUnique({ where: { token: storedSessionToken(token) } }))
    )
      return null;
  }
  if (lastSeen && lastSeen.getTime() < Date.now() - 60_000)
    await db.session.updateMany({ where: { id: session.id }, data: { lastSeenAt: new Date() } });

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
  await db.session.create({
    data: {
      token: storedSessionToken(token),
      userId,
      expiresAt,
      ipAddress: meta.ipAddress ?? undefined,
      userAgent: meta.userAgent ?? undefined,
      googleVerifiedAt: meta.googleVerifiedAt,
      lastSeenAt: new Date(),
    },
  });
  return { token, expiresAt };
}

export async function destroySession(db: Database, token: string | null) {
  if (!token) {
    return;
  }

  if (token.startsWith("sha256:")) return;
  await db.session.deleteMany({ where: { token: { in: [storedSessionToken(token), token] } } });
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
  const user = await db.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
  const stored = user?.passwordHash ?? (await (dummyHash ??= hashPassword(createSessionToken())));
  const valid = await verifyPassword(input.password, stored);
  if (!valid || !user || !user.passwordHash) {
    throw new ORPCError("UNAUTHORIZED", { message: "Invalid email or password." });
  }
  if (!user.passwordHash.startsWith("scrypt$v1$")) {
    await db.user.updateMany({
      where: { id: user.id, passwordHash: user.passwordHash },
      data: { passwordHash: await hashPassword(input.password) },
    });
  }

  if (user.status !== "active") {
    throw new ORPCError("FORBIDDEN", { message: "This account is disabled." });
  }

  const roleCount = await db.userRole.count({ where: { userId: user.id } });
  if (roleCount === 0) {
    throw new ORPCError("FORBIDDEN", { message: "No role is assigned to this account." });
  }
  await db.authThrottle.updateMany({
    where: { key: attempt.key, count: { gt: 0 } },
    data: { count: { increment: -1 } },
  });

  await writeAudit(db, {
    actorId: user.id,
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
    throw new ORPCError("FORBIDDEN", {
      message: "Public registration is disabled. Contact an administrator for access.",
    });
  const profile = signupSchema.parse(input);
  await assertPasswordSafe(profile.password);
  const email = profile.email.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    throw new ORPCError("CONFLICT", { message: "An account with that email already exists." });
  }

  const roleKey = "viewer";
  const role = await db.role.findUnique({ where: { key: roleKey } });
  if (!role) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Roles are not seeded." });
  }

  const user = await db.user
    .create({
      data: {
        name: profile.name,
        verificationRequired: true,
        phoneNumber: profile.phoneNumber,
        gender: profile.gender,
        facebookAccount: profile.facebookAccount,
        email,
        passwordHash: await hashPassword(input.password),
        status: "active",
        userRoles: {
          create: { roleId: role.id },
        },
      },
    })
    .catch((error: unknown) => {
      if (isDuplicateEmail(error))
        throw new ORPCError("CONFLICT", {
          message: "An account with that email already exists. Sign in instead.",
        });
      throw error;
    });

  await writeAudit(db, {
    actorId: user.id,
    action: "auth.signup",
    entity: "user",
    entityId: user.id,
    summary: `Registered account with role ${roleKey}`,
    ipAddress: input.ipAddress,
  });

  return user;
}

export async function upsertGoogleUser(
  db: Database,
  input: { email: string; name: string; image?: string | null },
) {
  const email = input.email.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.status !== "active") {
      throw new ORPCError("FORBIDDEN", { message: "This account is disabled." });
    }
    assertGoogleLinkAllowed(existing);
    return db.user.update({
      where: { id: existing.id },
      data: {
        name: input.name || existing.name,
        image: input.image ?? existing.image,
        emailVerified: true,
        verificationRequired: existing.verificationRequired || existing.passwordHash === null,
        needsProfileCompletion: existing.needsProfileCompletion || existing.passwordHash === null,
      },
    });
  }

  if (!publicSignupEnabled())
    throw new ORPCError("FORBIDDEN", {
      message: "Ask an administrator to create your account before using Google sign-in.",
    });

  const roleKey = "viewer";
  const role = await db.role.findUnique({ where: { key: roleKey } });
  if (!role) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Roles are not seeded." });
  }

  return db.user
    .create({
      data: {
        name: input.name,
        email,
        image: input.image ?? undefined,
        needsProfileCompletion: true,
        verificationRequired: true,
        emailVerified: true,
        status: "active",
        userRoles: {
          create: { roleId: role.id },
        },
      },
    })
    .catch(async (error: unknown) => {
      if (isDuplicateEmail(error)) {
        const winner = await db.user.findUnique({ where: { email } });
        if (winner?.status === "active") {
          assertGoogleLinkAllowed(winner);
          return winner;
        }
      }
      throw error;
    });
}

function isDuplicateEmail(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

// Do not activate a password/phone chosen by someone who reserved another
// person's email address before that email address was confirmed.
function assertGoogleLinkAllowed(user: {
  verificationRequired?: boolean;
  emailVerified?: boolean;
  passwordHash?: string | null;
}) {
  if (user.verificationRequired && !user.emailVerified && user.passwordHash)
    throw new ORPCError("FORBIDDEN", {
      message:
        "Confirm the pending registration email and sign in with its password before linking Google.",
    });
}
