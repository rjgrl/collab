import { ORPCError, os } from "@orpc/server";

import type { PermissionKey } from "@Alumni-Tracking-Ss/db";

import type { AuthUser, Context } from "./context";
import { requiresMfa } from "./services/mfa-policy";

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
    if (context.user.needsProfileCompletion)
      throw new ORPCError("FORBIDDEN", {
        message: "Complete account verification before using the application.",
      });
    if (requiresMfa(context.user) && !context.user.mfaVerified)
      throw new ORPCError("FORBIDDEN", {
        message: "Verify your authenticator before using the application.",
      });
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
