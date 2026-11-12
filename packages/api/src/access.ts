import type { PermissionKey } from "@Alumni-Tracking-Ss/db";
import { isAlumniAccount, isAdministrator } from "@Alumni-Tracking-Ss/contracts/names";
import type { Context } from "./context";
import { ApiError } from "./http-error";
import { requiresMfa } from "./services/mfa-policy";

export function requireUser(context: Context) {
  if (!context.user) throw new ApiError("UNAUTHORIZED", { message: "Sign in required." });
  if (context.user.status !== "active")
    throw new ApiError("FORBIDDEN", { message: "This account is disabled." });
  return context.user;
}

export function requireAccess(context: Context, permission?: PermissionKey) {
  const user = requireUser(context);
  if (user.needsProfileCompletion)
    throw new ApiError("FORBIDDEN", {
      message: "Complete account verification before using the application.",
    });
  if (requiresMfa(user) && !user.mfaVerified)
    throw new ApiError("FORBIDDEN", {
      message: "Verify your authenticator before using the application.",
    });
  if (permission && !user.permissions.includes(permission))
    throw new ApiError("FORBIDDEN", { message: `Missing permission: ${permission}` });
  return user;
}

export function rejectAlumniManagement(context: Context) {
  if (isAlumniAccount(requireUser(context)))
    throw new ApiError("FORBIDDEN", { message: "Alumni accounts can only access My Profile." });
}

export function requireAdministrator(context: Context, permission?: PermissionKey) {
  const user = requireAccess(context, permission);
  if (!isAdministrator(user))
    throw new ApiError("FORBIDDEN", {
      message: "Integrations are available to Administrators only.",
    });
  return user;
}
