import type { AuthUser } from "../context";

// Server configuration only. Never accept this switch from request input.
export function localMfaDisabled(settings: NodeJS.ProcessEnv = process.env) {
  return settings.NODE_ENV === "development" && settings.LOCAL_DISABLE_MFA === "true";
}

export function privilegedAccount(user: Pick<AuthUser, "roles" | "permissions">) {
  return (
    user.roles.includes("super_admin") ||
    user.permissions.some((key) => /^(users|roles|permissions|integrations)\./.test(key))
  );
}

export function requiresMfa(
  user: Pick<AuthUser, "roles" | "permissions" | "mfaRequired" | "mfaEnrolled">,
  settings: NodeJS.ProcessEnv = process.env,
) {
  return (
    !localMfaDisabled(settings) &&
    Boolean(user.mfaRequired || user.mfaEnrolled || privilegedAccount(user))
  );
}
