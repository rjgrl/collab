export const MFA_PERMISSIONS = [
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
] as const;

export function permissionRequiresMfa(key: string) {
  return (MFA_PERMISSIONS as readonly string[]).includes(key);
}
