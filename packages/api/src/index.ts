import { ORPCError, os } from "@orpc/server";

import type { PermissionKey } from "@Alumni-Tracking-Ss/db";

import type { AuthUser, Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

export const authenticated = o.use(async ({ context, next }) => {
  if (!context.user) {
    throw new ORPCError("UNAUTHORIZED", { message: "Sign in required." });
  }

  if (context.user.status !== "active") {
    throw new ORPCError("FORBIDDEN", { message: "This account is disabled." });
  }

  return next({
    context: {
      ...context,
      user: context.user,
    },
  });
});

export function requirePermission(permission: PermissionKey) {
  return authenticated.use(async ({ context, next }) => {
    if (!context.user.permissions.includes(permission)) {
      throw new ORPCError("FORBIDDEN", {
        message: `Missing permission: ${permission}`,
      });
    }

    return next({
      context: {
        ...context,
        user: context.user as AuthUser,
      },
    });
  });
}
