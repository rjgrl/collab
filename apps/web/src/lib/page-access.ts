import { isAdministrator, isAlumniAccount } from "@Alumni-Tracking-Ss/contracts/names";
import { can, canAssignFaculty, managesFaculty, useSession } from "@/lib/session";

type SessionUser = NonNullable<ReturnType<typeof useSession>["data"]>;

/** Who may open each page; the server still enforces every request. Longest prefix wins. */
const PAGE_RULES: { path: string; allows: (user: SessionUser) => boolean }[] = [
  { path: "/dashboard", allows: (user) => can(user.permissions, "dashboard.read") },
  { path: "/colleges", allows: (user) => can(user.permissions, "departments.read") },
  { path: "/departments", allows: (user) => can(user.permissions, "departments.read") },
  { path: "/programs", allows: (user) => can(user.permissions, "programs.read") },
  { path: "/alumni", allows: (user) => can(user.permissions, "alumni.read") },
  // Gated by faculty level, not an RBAC key.
  { path: "/faculty", allows: (user) => canAssignFaculty(user) },
  { path: "/reports", allows: (user) => can(user.permissions, "reports.read") },
  // Administrators see every entry; heads and Alumni see entries in their scope.
  {
    path: "/audit",
    allows: (user) =>
      can(user.permissions, "audit.read") || managesFaculty(user) || isAlumniAccount(user),
  },
  { path: "/settings/users", allows: (user) => can(user.permissions, "users.read") },
  { path: "/settings/roles", allows: (user) => can(user.permissions, "roles.read") },
  {
    path: "/settings/integrations",
    allows: (user) => isAdministrator(user) && can(user.permissions, "integrations.read"),
  },
  { path: "/settings/backups", allows: (user) => isAdministrator(user) },
];

const matches = (pathname: string, path: string) =>
  pathname === path || pathname.startsWith(`${path}/`);

export function canOpenPage(pathname: string, user: SessionUser | null | undefined) {
  if (!user) return false;
  const rule = PAGE_RULES.filter((item) => matches(pathname, item.path)).sort(
    (a, b) => b.path.length - a.path.length,
  )[0];
  return rule ? rule.allows(user) : true;
}
