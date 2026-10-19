import {
  verificationStatus,
  startVerification,
  confirmVerification,
  createGooglePassword,
} from "../services/verification";
import { isPermissionKey } from "@Alumni-Tracking-Ss/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { newPasswordSchema } from "../password-policy";
import { assertPasswordSafe } from "../services/password-security";
import { requestPasswordReset, resetPassword } from "../services/password-reset";
import { rotateSession } from "../services/session-rotation";
import { beginMfa, confirmMfa, mfaStatus, verifyMfa } from "../services/mfa";

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
import { accountProfileSchema, loginSchema, signupSchema } from "../validation";
import {
  authenticateWithPassword,
  createSession,
  destroySession,
  loadAuthUser,
  registerUser,
  publicSignupEnabled,
} from "../services/session";

export const authRouter = {
  forgotPassword: publicProcedure
    .input(z.object({ email: z.string().trim().email().max(254) }))
    .handler(({ context, input }) => requestPasswordReset(context, input.email)),
  resetPassword: publicProcedure
    .input(z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: newPasswordSchema }))
    .handler(({ context, input }) => resetPassword(context, input.token, input.password)),
  mfaStatus: authenticated.handler(({ context }) => mfaStatus(context)),
  beginMfa: authenticated
    .input(z.object({ password: z.string().min(1).max(256) }))
    .handler(({ context, input }) => beginMfa(context, input.password)),
  confirmMfa: authenticated
    .input(z.object({ code: z.string().regex(/^\d{6}$/) }))
    .handler(({ context, input }) => confirmMfa(context, input.code)),
  verifyMfa: authenticated
    .input(z.object({ code: z.string().regex(/^(\d{6}|[a-fA-F0-9]{32})$/) }))
    .handler(({ context, input }) => verifyMfa(context, input.code)),
  verificationStatus: authenticated.handler(({ context }) => verificationStatus(context)),
  sendVerification: authenticated
    .input(z.object({ kind: z.enum(["email", "phone"]) }))
    .handler(({ context, input }) => startVerification(context, input.kind)),
  confirmVerification: authenticated
    .input(
      z.object({
        kind: z.enum(["email", "phone"]),
        code: z.string().regex(/^\d{6}$/, "Enter the six-digit code."),
      }),
    )
    .handler(({ context, input }) => confirmVerification(context, input.kind, input.code)),
  createGooglePassword: authenticated
    .input(
      z
        .object({ password: newPasswordSchema, confirmation: z.string().max(256) })
        .refine((value) => value.password === value.confirmation, {
          message: "Passwords must match.",
          path: ["confirmation"],
        }),
    )
    .handler(({ context, input }) => createGooglePassword(context, input.password)),
  completeProfile: authenticated.input(accountProfileSchema).handler(async ({ context, input }) => {
    const current = await context.db.user.findUniqueOrThrow({ where: { id: context.user.id } });
    await context.db.user.update({
      where: { id: context.user.id },
      data: {
        ...input,
        needsProfileCompletion: false,
        ...(current.phoneNumber !== input.phoneNumber ? { phoneVerified: false } : {}),
      },
      select: { id: true },
    });
    return { ok: true };
  }),
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
        currentPassword: z.string().min(1).max(256),
        password: newPasswordSchema,
      }),
    )
    .handler(async ({ context, input }) => {
      await assertPasswordSafe(input.password);
      const { hashPassword, verifyPassword } = await import("@Alumni-Tracking-Ss/db");
      const passwordHash = await hashPassword(input.password);
      const rotated = await authorizationTransaction(context.db, async (tx) => {
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
        const session = await rotateSession(tx, context, undefined, true);
        await writeAudit(tx, {
          actorId: user.id,
          action: "auth.password",
          entity: "user",
          entityId: user.id,
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
      ...input,
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
    .input(
      z
        .object({
          search: z.string().trim().max(120).optional(),
          page: z.number().int().min(1).max(100000).default(1),
          pageSize: z.number().int().min(1).max(100).default(20),
        })
        .optional(),
    )
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
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: ((input?.page ?? 1) - 1) * (input?.pageSize ?? 20),
        take: input?.pageSize ?? 20,
      }),
    ),
  create: requirePermission("users.write")
    .input(
      z.object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email(),
        password: newPasswordSchema,
        roleIds: idsSchema.min(1),
      }),
    )
    .handler(async ({ context, input }) => {
      await assertPasswordSafe(input.password);
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
          password: newPasswordSchema.optional(),
        })
        .strict(),
    )
    .handler(async ({ context, input }) => {
      if (input.password) await assertPasswordSafe(input.password);
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
        if (passwordHash || input.roleIds)
          await tx.session.deleteMany({ where: { userId: input.id } });
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
