import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { publicProcedure, requirePermission } from "../index";
import { writeAudit } from "../audit";
import { isIntegrationEnabled } from "../integrations/registry";
import { verifyRecaptcha } from "../integrations/recaptcha";
import { loginSchema, signupSchema } from "../validation";
import {
  authenticateWithPassword,
  createSession,
  destroySession,
  loadAuthUser,
  registerUser,
} from "../services/session";

export const authRouter = {
  config: publicProcedure.handler(async ({ context }) => {
    const recaptchaEnabled = await isIntegrationEnabled(context.db, "recaptcha");
    const googleEnabled = await isIntegrationEnabled(context.db, "google_auth");

    return {
      recaptcha: {
        enabled: recaptchaEnabled,
        live: Boolean(context.integrationEnv.recaptchaSecretKey && context.integrationEnv.recaptchaSiteKey),
        siteKey: recaptchaEnabled ? context.integrationEnv.recaptchaSiteKey ?? null : null,
      },
      google: {
        enabled: googleEnabled && Boolean(context.integrationEnv.googleClientId && context.integrationEnv.googleClientSecret),
      },
    };
  }),

  me: publicProcedure.handler(async ({ context }) => {
    if (!context.user) {
      return null;
    }
    return context.user;
  }),

  login: publicProcedure.input(loginSchema).handler(async ({ context, input }) => {
    const recaptchaEnabled = await isIntegrationEnabled(context.db, "recaptcha");
    if (recaptchaEnabled) {
      const ok = await verifyRecaptcha(context.integrationEnv, {
        token: input.recaptchaToken,
        fallback: input.recaptchaFallback,
      });
      if (!ok) {
        throw new ORPCError("BAD_REQUEST", { message: "Complete the reCAPTCHA check." });
      }
    }

    const user = await authenticateWithPassword(context.db, {
      email: input.email,
      password: input.password,
      ipAddress: context.ipAddress,
    });
    const session = await createSession(context.db, user.id, {
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    const authUser = await loadAuthUser(context.db, user.id);

    return {
      user: authUser,
      sessionToken: session.token,
      expiresAt: session.expiresAt.toISOString(),
    };
  }),

  signup: publicProcedure.input(signupSchema).handler(async ({ context, input }) => {
    const recaptchaEnabled = await isIntegrationEnabled(context.db, "recaptcha");
    if (recaptchaEnabled) {
      const ok = await verifyRecaptcha(context.integrationEnv, {
        token: input.recaptchaToken,
        fallback: input.recaptchaFallback,
      });
      if (!ok) {
        throw new ORPCError("BAD_REQUEST", { message: "Complete the reCAPTCHA check." });
      }
    }

    const user = await registerUser(context.db, {
      name: input.name,
      email: input.email,
      password: input.password,
      ipAddress: context.ipAddress,
    });
    const session = await createSession(context.db, user.id, {
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    const authUser = await loadAuthUser(context.db, user.id);

    return {
      user: authUser,
      sessionToken: session.token,
      expiresAt: session.expiresAt.toISOString(),
    };
  }),

  logout: publicProcedure.handler(async ({ context }) => {
    await destroySession(context.db, context.sessionToken);
    if (context.user) {
      await writeAudit(context.db, {
        actorId: context.user.id,
        action: "auth.logout",
        entity: "user",
        entityId: context.user.id,
        summary: "Signed out",
        ipAddress: context.ipAddress,
      });
    }
    return { ok: true };
  }),
};

export const usersRouter = {
  list: requirePermission("users.read")
    .input(z.object({ search: z.string().optional() }).optional())
    .handler(async ({ context, input }) => {
      const search = input?.search?.trim();
      return context.db.user.findMany({
        where: search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : undefined,
        include: {
          userRoles: { include: { role: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  create: requirePermission("users.write")
    .input(
      z.object({
        name: z.string().trim().min(1),
        email: z.string().email(),
        password: z.string().min(8),
        roleIds: z.array(z.string()).default([]),
      }),
    )
    .handler(async ({ context, input }) => {
      const { hashPassword } = await import("@Alumni-Tracking-Ss/db");
      const existing = await context.db.user.findUnique({
        where: { email: input.email.toLowerCase() },
      });
      if (existing) {
        throw new ORPCError("CONFLICT", { message: "Email is already in use." });
      }

      const user = await context.db.user.create({
        data: {
          name: input.name,
          email: input.email.toLowerCase(),
          passwordHash: await hashPassword(input.password),
          userRoles: {
            create: input.roleIds.map((roleId) => ({ roleId })),
          },
        },
        include: { userRoles: { include: { role: true } } },
      });

      await writeAudit(context.db, {
        actorId: context.user.id,
        action: "users.create",
        entity: "user",
        entityId: user.id,
        summary: `Created user ${user.email}`,
        ipAddress: context.ipAddress,
      });

      return user;
    }),

  update: requirePermission("users.write")
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).optional(),
        status: z.enum(["active", "disabled"]).optional(),
        roleIds: z.array(z.string()).optional(),
        password: z.string().min(8).optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const { hashPassword } = await import("@Alumni-Tracking-Ss/db");
      if (input.roleIds) {
        await context.db.userRole.deleteMany({ where: { userId: input.id } });
        if (input.roleIds.length > 0) {
          await context.db.userRole.createMany({
            data: input.roleIds.map((roleId) => ({ userId: input.id, roleId })),
          });
        }
      }

      const user = await context.db.user.update({
        where: { id: input.id },
        data: {
          name: input.name,
          status: input.status,
          passwordHash: input.password ? await hashPassword(input.password) : undefined,
        },
        include: { userRoles: { include: { role: true } } },
      });

      await writeAudit(context.db, {
        actorId: context.user.id,
        action: "users.update",
        entity: "user",
        entityId: user.id,
        summary: `Updated user ${user.email}`,
        ipAddress: context.ipAddress,
      });

      return user;
    }),
};

export const rolesRouter = {
  list: requirePermission("roles.read").handler(async ({ context }) => {
    return context.db.role.findMany({
      include: {
        rolePermissions: { include: { permission: true } },
        _count: { select: { userRoles: true } },
      },
      orderBy: { name: "asc" },
    });
  }),

  create: requirePermission("roles.write")
    .input(
      z.object({
        key: z.string().trim().min(1),
        name: z.string().trim().min(1),
        description: z.string().optional(),
        permissionIds: z.array(z.string()).default([]),
      }),
    )
    .handler(async ({ context, input }) => {
      const role = await context.db.role.create({
        data: {
          key: input.key,
          name: input.name,
          description: input.description ?? "",
          rolePermissions: {
            create: input.permissionIds.map((permissionId) => ({ permissionId })),
          },
        },
        include: { rolePermissions: { include: { permission: true } } },
      });

      await writeAudit(context.db, {
        actorId: context.user.id,
        action: "roles.create",
        entity: "role",
        entityId: role.id,
        summary: `Created role ${role.name}`,
        ipAddress: context.ipAddress,
      });

      return role;
    }),

  update: requirePermission("roles.write")
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).optional(),
        description: z.string().optional(),
        permissionIds: z.array(z.string()).optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      if (input.permissionIds) {
        await context.db.rolePermission.deleteMany({ where: { roleId: input.id } });
        if (input.permissionIds.length > 0) {
          await context.db.rolePermission.createMany({
            data: input.permissionIds.map((permissionId) => ({
              roleId: input.id,
              permissionId,
            })),
          });
        }
      }

      const role = await context.db.role.update({
        where: { id: input.id },
        data: {
          name: input.name,
          description: input.description,
        },
        include: { rolePermissions: { include: { permission: true } } },
      });

      await writeAudit(context.db, {
        actorId: context.user.id,
        action: "roles.update",
        entity: "role",
        entityId: role.id,
        summary: `Updated role ${role.name}`,
        ipAddress: context.ipAddress,
      });

      return role;
    }),

  delete: requirePermission("roles.delete")
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const role = await context.db.role.findUnique({ where: { id: input.id } });
      if (!role) {
        throw new ORPCError("NOT_FOUND", { message: "Role not found." });
      }
      if (role.isSystem) {
        throw new ORPCError("BAD_REQUEST", { message: "System roles cannot be deleted." });
      }

      await context.db.role.delete({ where: { id: input.id } });
      await writeAudit(context.db, {
        actorId: context.user.id,
        action: "roles.delete",
        entity: "role",
        entityId: role.id,
        summary: `Deleted role ${role.name}`,
        ipAddress: context.ipAddress,
      });
      return { ok: true };
    }),
};

export const permissionsRouter = {
  list: requirePermission("permissions.read").handler(async ({ context }) => {
    return context.db.permission.findMany({ orderBy: [{ module: "asc" }, { key: "asc" }] });
  }),
};
