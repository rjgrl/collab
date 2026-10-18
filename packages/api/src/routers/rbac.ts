import { isPermissionKey } from "@Alumni-Tracking-Ss/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { authenticated, publicProcedure, requirePermission } from "../index";
import { writeAudit } from "../audit";
import { isDatabaseUnavailable } from "../errors";
import { isIntegrationEnabled } from "../integrations/registry";
import { verifyRecaptcha } from "../integrations/recaptcha";
import {
  assertRoleScope,
  authorizationTransaction,
  publicUserSelect,
  roleScopeInclude,
  validatePermissionIds,
  validateRoleIds,
} from "../services/authorization";
import { loginSchema, signupSchema } from "../validation";
import {
  authenticateWithPassword,
  createSession,
  destroySession,
  loadAuthUser,
  registerUser,
  publicSignupEnabled,
} from "../services/session";

export const authRouter = {
  updateProfile: authenticated
    .input(z.object({ name: z.string().trim().min(1).max(120) }))
    .handler(async ({ context, input }) => {
      await context.db.user.update({
        where: { id: context.user.id },
        data: { name: input.name },
        select: { id: true },
      });
      return { ok: true };
    }),
  changePassword: authenticated
    .input(
      z.object({
        currentPassword: z.string().min(1).max(128),
        password: z.string().min(8).max(128),
      }),
    )
    .handler(async ({ context, input }) => {
      const { hashPassword, verifyPassword } = await import("@Alumni-Tracking-Ss/db");
      const passwordHash = await hashPassword(input.password);
      return authorizationTransaction(context.db, async (tx) => {
        const user = await tx.user.findUnique({ where: { id: context.user.id } });
        if (
          !user?.passwordHash ||
          !(await verifyPassword(input.currentPassword, user.passwordHash))
        ) {
          throw new ORPCError("FORBIDDEN", {
            message: "Current password is incorrect or password sign-in is not configured.",
          });
        }
        await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
        await tx.session.deleteMany({
          where: { userId: user.id, token: { not: context.sessionToken ?? "" } },
        });
        await writeAudit(tx, {
          actorId: user.id,
          action: "auth.password",
          entity: "user",
          entityId: user.id,
          summary: "Changed password and revoked other sessions",
        });
        return { ok: true };
      });
    }),
  config: publicProcedure.handler(async ({ context }) => {
    try {
      const recaptchaEnabled = await isIntegrationEnabled(context.db, "recaptcha");
      const googleEnabled = await isIntegrationEnabled(context.db, "google_auth");

      return {
        signupEnabled: publicSignupEnabled(),
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
      if (!isDatabaseUnavailable(error)) {
        throw error;
      }
      return {
        signupEnabled: publicSignupEnabled(),
        recaptcha: { enabled: false, live: false, siteKey: null },
        google: { enabled: false },
      };
    }
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

const idsSchema = z
  .array(z.string().min(1))
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate assignments are not allowed.");

export const usersRouter = {
  list: requirePermission("users.read")
    .input(z.object({ search: z.string().trim().max(120).optional() }).optional())
    .handler(async ({ context, input }) =>
      context.db.user.findMany({
        where: input?.search
          ? {
              OR: [
                { name: { contains: input.search, mode: "insensitive" } },
                { email: { contains: input.search, mode: "insensitive" } },
              ],
            }
          : undefined,
        select: publicUserSelect,
        orderBy: { createdAt: "desc" },
      }),
    ),
  create: requirePermission("users.write")
    .input(
      z.object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email(),
        password: z.string().min(8).max(128),
        roleIds: idsSchema.min(1),
      }),
    )
    .handler(async ({ context, input }) => {
      const { hashPassword } = await import("@Alumni-Tracking-Ss/db");
      const passwordHash = await hashPassword(input.password);
      return authorizationTransaction(context.db, async (tx) => {
        await validateRoleIds(tx, context.user, input.roleIds);
        if (await tx.user.findUnique({ where: { email: input.email.toLowerCase() } }))
          throw new ORPCError("CONFLICT", { message: "Email is already in use." });
        const user = await tx.user.create({
          data: {
            name: input.name,
            email: input.email.toLowerCase(),
            passwordHash,
            userRoles: { create: input.roleIds.map((roleId) => ({ roleId })) },
          },
          select: publicUserSelect,
        });
        await writeAudit(tx, {
          actorId: context.user.id,
          action: "users.create",
          entity: "user",
          entityId: user.id,
          summary: "Created user account",
          ipAddress: context.ipAddress,
        });
        return user;
      });
    }),
  update: requirePermission("users.write")
    .input(
      z
        .object({
          id: z.string(),
          name: z.string().trim().min(1).max(120).optional(),
          roleIds: idsSchema.optional(),
          password: z.string().min(8).max(128).optional(),
        })
        .strict(),
    )
    .handler(async ({ context, input }) => {
      const { hashPassword } = await import("@Alumni-Tracking-Ss/db");
      const passwordHash = input.password ? await hashPassword(input.password) : undefined;
      return authorizationTransaction(context.db, async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: input.id },
          include: { userRoles: { include: { role: { include: roleScopeInclude } } } },
        });
        if (!target) throw new ORPCError("NOT_FOUND", { message: "User not found." });
        assertRoleScope(
          context.user,
          target.userRoles.map(({ role }) => role),
        );
        if (input.roleIds) {
          if (target.userRoles.some(({ role }) => role.key === "super_admin"))
            throw new ORPCError("FORBIDDEN", {
              message: "Super administrator role assignments are protected.",
            });
          await validateRoleIds(tx, context.user, input.roleIds);
          await tx.userRole.deleteMany({ where: { userId: input.id } });
          if (input.roleIds.length)
            await tx.userRole.createMany({
              data: input.roleIds.map((roleId) => ({ userId: input.id, roleId })),
            });
        }
        const user = await tx.user.update({
          where: { id: input.id },
          data: { name: input.name, passwordHash },
          select: publicUserSelect,
        });
        if (passwordHash) await tx.session.deleteMany({ where: { userId: input.id } });
        await writeAudit(tx, {
          actorId: context.user.id,
          action: "users.update",
          entity: "user",
          entityId: user.id,
          summary: "Updated user account",
          ipAddress: context.ipAddress,
        });
        return user;
      });
    }),
  setStatus: requirePermission("users.delete")
    .input(z.object({ id: z.string(), status: z.enum(["active", "disabled"]) }))
    .handler(async ({ context, input }) =>
      authorizationTransaction(context.db, async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: input.id },
          include: { userRoles: { include: { role: { include: roleScopeInclude } } } },
        });
        if (!target) throw new ORPCError("NOT_FOUND", { message: "User not found." });
        assertRoleScope(
          context.user,
          target.userRoles.map(({ role }) => role),
        );
        if (target.userRoles.some(({ role }) => role.key === "super_admin"))
          throw new ORPCError("FORBIDDEN", {
            message: "Super administrator accounts cannot be disabled here.",
          });
        const user = await tx.user.update({
          where: { id: input.id },
          data: { status: input.status },
          select: publicUserSelect,
        });
        if (input.status === "disabled")
          await tx.session.deleteMany({ where: { userId: input.id } });
        await writeAudit(tx, {
          actorId: context.user.id,
          action: "users.status",
          entity: "user",
          entityId: input.id,
          summary: "Account " + input.status,
          ipAddress: context.ipAddress,
        });
        return user;
      }),
    ),
};

export const rolesRouter = {
  list: requirePermission("roles.read").handler(async ({ context }) =>
    context.db.role
      .findMany({
        include: { ...roleScopeInclude, _count: { select: { userRoles: true } } },
        orderBy: { name: "asc" },
      })
      .then((roles) =>
        roles.map((role) => ({
          ...role,
          rolePermissions: role.rolePermissions.filter(({ permission }) =>
            isPermissionKey(permission.key),
          ),
        })),
      ),
  ),
  create: requirePermission("roles.write")
    .input(
      z.object({
        key: z
          .string()
          .trim()
          .regex(/^[a-z][a-z0-9_]{0,63}$/),
        name: z.string().trim().min(1).max(80),
        description: z.string().max(400).optional(),
        permissionIds: idsSchema.default([]),
      }),
    )
    .handler(async ({ context, input }) =>
      authorizationTransaction(context.db, async (tx) => {
        if (input.key === "super_admin")
          throw new ORPCError("FORBIDDEN", { message: "Reserved role key." });
        await validatePermissionIds(tx, context.user, input.permissionIds);
        const role = await tx.role.create({
          data: {
            key: input.key,
            name: input.name,
            description: input.description ?? "",
            rolePermissions: {
              create: input.permissionIds.map((permissionId) => ({ permissionId })),
            },
          },
          include: roleScopeInclude,
        });
        await writeAudit(tx, {
          actorId: context.user.id,
          action: "roles.create",
          entity: "role",
          entityId: role.id,
          summary: "Created role " + role.name,
          ipAddress: context.ipAddress,
        });
        return role;
      }),
    ),
  update: requirePermission("roles.write")
    .input(
      z.object({
        id: z.string(),
        expectedUpdatedAt: z.string().datetime(),
        name: z.string().trim().min(1).max(80).optional(),
        description: z.string().max(400).optional(),
        permissionIds: idsSchema.optional(),
      }),
    )
    .handler(async ({ context, input }) =>
      authorizationTransaction(context.db, async (tx) => {
        const current = await tx.role.findUnique({
          where: { id: input.id },
          include: roleScopeInclude,
        });
        if (!current) throw new ORPCError("NOT_FOUND", { message: "Role not found." });
        assertRoleScope(context.user, [current]);
        if (current.key === "super_admin")
          throw new ORPCError("FORBIDDEN", {
            message: "The super administrator role is protected.",
          });
        if (input.permissionIds) await validatePermissionIds(tx, context.user, input.permissionIds);
        const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
        const claimed = await tx.role.updateMany({
          where: { id: input.id, updatedAt: new Date(input.expectedUpdatedAt) },
          data: { name: input.name, description: input.description, updatedAt },
        });
        if (claimed.count !== 1)
          throw new ORPCError("CONFLICT", {
            message: "This role changed. Reload the latest permissions before saving.",
          });
        if (input.permissionIds) {
          await tx.rolePermission.deleteMany({ where: { roleId: input.id } });
          if (input.permissionIds.length)
            await tx.rolePermission.createMany({
              data: input.permissionIds.map((permissionId) => ({ roleId: input.id, permissionId })),
            });
        }
        const role = await tx.role.findUniqueOrThrow({
          where: { id: input.id },
          include: roleScopeInclude,
        });
        await writeAudit(tx, {
          actorId: context.user.id,
          action: "roles.update",
          entity: "role",
          entityId: role.id,
          summary: "Updated role permissions",
          metadata: {
            before: current.rolePermissions.map(({ permission }) => permission.key),
            after: role.rolePermissions.map(({ permission }) => permission.key),
          },
          ipAddress: context.ipAddress,
        });
        return role;
      }),
    ),
  delete: requirePermission("roles.delete")
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) =>
      authorizationTransaction(context.db, async (tx) => {
        const role = await tx.role.findUnique({
          where: { id: input.id },
          include: roleScopeInclude,
        });
        if (!role) throw new ORPCError("NOT_FOUND", { message: "Role not found." });
        assertRoleScope(context.user, [role]);
        if (role.isSystem)
          throw new ORPCError("BAD_REQUEST", { message: "System roles cannot be deleted." });
        await tx.role.delete({ where: { id: input.id } });
        await writeAudit(tx, {
          actorId: context.user.id,
          action: "roles.delete",
          entity: "role",
          entityId: role.id,
          summary: "Deleted role " + role.name,
          ipAddress: context.ipAddress,
        });
        return { ok: true };
      }),
    ),
};
export const permissionsRouter = {
  list: requirePermission("permissions.read").handler(async ({ context }) =>
    context.db.permission
      .findMany({ orderBy: [{ module: "asc" }, { key: "asc" }] })
      .then((items) => items.filter((item) => isPermissionKey(item.key))),
  ),
};
