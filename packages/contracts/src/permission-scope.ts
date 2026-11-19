import { isAdministrator } from "./names";

/**
 * Permissions that act across the whole university rather than within a college, department or
 * assignment. Only Super Admins hold them: a custom or Faculty role that has one stored gets no
 * access from it, and roles cannot be given one. (Scoped work such as heads managing faculty and
 * assignments comes from the Faculty record, not from these permissions.)
 */
export const SUPER_ADMIN_ONLY_PERMISSIONS = [
  "users.read",
  "users.write",
  "users.delete",
  "roles.read",
  "roles.write",
  "roles.delete",
  "permissions.read",
  "departments.write",
  "departments.delete",
  "programs.write",
  "programs.delete",
  "integrations.read",
  "integrations.write",
  "audit.read",
] as const;

export function isSuperAdminOnlyPermission(key: string) {
  return (SUPER_ADMIN_ONLY_PERMISSIONS as readonly string[]).includes(key);
}

/** The permissions an account actually has: Super Admin-only ones count only for Super Admins. */
export function effectivePermissions<K extends string>(
  user: { roles: readonly string[] },
  keys: K[],
) {
  return isAdministrator(user) ? keys : keys.filter((key) => !isSuperAdminOnlyPermission(key));
}
