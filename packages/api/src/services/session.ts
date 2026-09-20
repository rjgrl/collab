import type { Database, PermissionKey } from "@Alumni-Tracking-Ss/db";
import { createSessionToken, hashPassword, verifyPassword } from "@Alumni-Tracking-Ss/db";
import { ORPCError } from "@orpc/server";

import type { AuthUser } from "../context";
import { writeAudit } from "../audit";

const SESSION_DAYS = 7;

export async function loadAuthUser(db: Database, userId: string): Promise<AuthUser | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
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

  if (!user) {
    return null;
  }

  const roles = user.userRoles.map((item) => item.role.key);
  const permissions = [
    ...new Set(
      user.userRoles.flatMap((item) =>
        item.role.rolePermissions.map((rolePermission) => rolePermission.permission.key),
      ),
    ),
  ] as PermissionKey[];

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    status: user.status,
    roles,
    permissions,
  };
}

export async function loadAuthUserFromToken(db: Database, token: string | null) {
  if (!token) {
    return null;
  }

  const session = await db.session.findUnique({
    where: { token },
  });

  if (!session || session.expiresAt.getTime() < Date.now()) {
    if (session) {
      await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    }
    return null;
  }

  return loadAuthUser(db, session.userId);
}

export async function createSession(
  db: Database,
  userId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null },
) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({
    data: {
      token,
      userId,
      expiresAt,
      ipAddress: meta.ipAddress ?? undefined,
      userAgent: meta.userAgent ?? undefined,
    },
  });
  return { token, expiresAt };
}

export async function destroySession(db: Database, token: string | null) {
  if (!token) {
    return;
  }

  await db.session.deleteMany({ where: { token } });
}

export async function authenticateWithPassword(
  db: Database,
  input: { email: string; password: string; ipAddress?: string | null },
) {
  const user = await db.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!user || !user.passwordHash) {
    throw new ORPCError("UNAUTHORIZED", { message: "Invalid email or password." });
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new ORPCError("UNAUTHORIZED", { message: "Invalid email or password." });
  }

  if (user.status !== "active") {
    throw new ORPCError("FORBIDDEN", { message: "This account is disabled." });
  }

  const roleCount = await db.userRole.count({ where: { userId: user.id } });
  if (roleCount === 0) {
    throw new ORPCError("FORBIDDEN", { message: "No role is assigned to this account." });
  }

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
  input: { name: string; email: string; password: string; ipAddress?: string | null },
) {
  const email = input.email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    throw new ORPCError("CONFLICT", { message: "An account with that email already exists." });
  }

  const userCount = await db.user.count();
  const roleKey = userCount === 0 ? "super_admin" : "viewer";
  const role = await db.role.findUnique({ where: { key: roleKey } });
  if (!role) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Roles are not seeded." });
  }

  const user = await db.user.create({
    data: {
      name: input.name,
      email,
      passwordHash: await hashPassword(input.password),
      status: "active",
      userRoles: {
        create: { roleId: role.id },
      },
    },
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
  const email = input.email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.status !== "active") {
      throw new ORPCError("FORBIDDEN", { message: "This account is disabled." });
    }
    return db.user.update({
      where: { id: existing.id },
      data: {
        name: input.name || existing.name,
        image: input.image ?? existing.image,
        emailVerified: true,
      },
    });
  }

  const userCount = await db.user.count();
  const roleKey = userCount === 0 ? "super_admin" : "viewer";
  const role = await db.role.findUnique({ where: { key: roleKey } });
  if (!role) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Roles are not seeded." });
  }

  return db.user.create({
    data: {
      name: input.name,
      email,
      image: input.image ?? undefined,
      emailVerified: true,
      status: "active",
      userRoles: {
        create: { roleId: role.id },
      },
    },
  });
}
