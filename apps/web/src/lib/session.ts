import { isAdministrator } from "@Alumni-Tracking-Ss/contracts/names";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

export function useSession() {
  return useQuery({
    ...api.auth.me.queryOptions(),
    staleTime: 30_000,
  });
}

export function can(permissions: string[] | undefined, permission: string) {
  return Boolean(permissions?.includes(permission));
}

type SessionUser = { roles: readonly string[]; faculty?: { roleLevel: string } | null };

/** Mirrors the server's managerScope: administrators and college/department heads. */
export function managesFaculty(user: SessionUser | null | undefined) {
  if (!user) return false;
  return isAdministrator(user) || Boolean(user.faculty && user.faculty.roleLevel !== "faculty");
}

/** Mirrors the server's assignmentScope: administrators and heads. */
export function canAssignFaculty(user: SessionUser | null | undefined) {
  return managesFaculty(user);
}
