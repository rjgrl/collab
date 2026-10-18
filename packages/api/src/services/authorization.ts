import { isPermissionKey } from "@Alumni-Tracking-Ss/db";
import type { Database, Prisma } from "@Alumni-Tracking-Ss/db";
import { ORPCError } from "@orpc/server";
import type { AuthUser } from "../context";

export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  userRoles: { include: { role: true } },
} satisfies Prisma.UserSelect;

type RoleScope = {
  key: string;
  isSystem: boolean;
  rolePermissions: { permission: { key: string } }[];
};
export const roleScopeInclude = { rolePermissions: { include: { permission: true } } } as const;

export function assertRoleScope(actor: AuthUser, roles: RoleScope[]) {
  for (const role of roles) {
    if ((role.key === "super_admin" || role.isSystem) && !actor.roles.includes("super_admin")) {
      throw new ORPCError("FORBIDDEN", {
        message: "Only a super administrator can manage system roles.",
      });
    }
    if (
      role.rolePermissions.some(
        ({ permission }) =>
          !permission.key.startsWith("faculties.") &&
          !actor.permissions.some((key) => key === permission.key),
      )
    ) {
      throw new ORPCError("FORBIDDEN", {
        message: "You cannot manage access beyond your own permissions.",
      });
    }
  }
}

export async function validateRoleIds(
  db: Prisma.TransactionClient,
  actor: AuthUser,
  ids: string[],
) {
  const roles = await db.role.findMany({ where: { id: { in: ids } }, include: roleScopeInclude });
  if (roles.length !== ids.length)
    throw new ORPCError("BAD_REQUEST", { message: "One or more roles no longer exist." });
  assertRoleScope(actor, roles);
}

export async function validatePermissionIds(
  db: Prisma.TransactionClient,
  actor: AuthUser,
  ids: string[],
) {
  const permissions = await db.permission.findMany({ where: { id: { in: ids } } });
  if (permissions.length !== ids.length)
    throw new ORPCError("BAD_REQUEST", { message: "One or more permissions no longer exist." });
  if (
    permissions.some(
      ({ key }) => !isPermissionKey(key) || !actor.permissions.some((own) => own === key),
    )
  ) {
    throw new ORPCError("FORBIDDEN", { message: "You cannot grant permissions you do not hold." });
  }
}

export async function authorizationTransaction<T>(
  db: Database,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  try {
    return await db.$transaction(work);
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      throw new ORPCError("CONFLICT", {
        message: "An account or role with this identifier already exists.",
      });
    }
    if (typeof error === "object" && error && "code" in error && error.code === "P2034") {
      throw new ORPCError("CONFLICT", {
        message: "Access changed during this save. Reload and try again.",
      });
    }
    throw error;
  }
}
