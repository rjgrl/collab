import { isPermissionKey, toEntity, type Database } from "@Alumni-Tracking-Ss/db";
import type { Role } from "@Alumni-Tracking-Ss/contracts/roles";
import type { PublicUser } from "@Alumni-Tracking-Ss/contracts/users";
import { formatDisplayName } from "@Alumni-Tracking-Ss/contracts/names";
import { ApiError } from "../http-error";
import type { AuthUser } from "../context";

export type RoleScope = {
  key: string;
  isSystem: boolean;
  rolePermissions: { permission: { key: string } }[];
};
export async function loadRoles(db: Database, ids?: string[]): Promise<Role[]> {
  const roles = (
    await db.Role.find(ids ? { _id: { $in: ids } } : {})
      .sort({ name: 1 })
      .lean()
      .exec()
  ).map((row) => toEntity(row));
  if (!roles.length) return [];
  const links = (
    await db.RolePermission.find({ roleId: { $in: roles.map((role) => role.id) } })
      .lean()
      .exec()
  ).map((row) => toEntity(row));
  const permissions = (
    await db.Permission.find({ _id: { $in: links.map((link) => link.permissionId) } })
      .lean()
      .exec()
  ).map((row) => toEntity(row));
  const assignments = await db.UserRole.find({ roleId: { $in: roles.map((role) => role.id) } })
    .lean()
    .exec();
  return roles.map((role) => ({
    ...role,
    name: role.key === "viewer" || role.key === "alumni" ? "Alumni" : role.name,
    description: role.description ?? "",
    _count: { userRoles: assignments.filter((link) => String(link.roleId) === role.id).length },
    rolePermissions: links
      .filter((link) => link.roleId === role.id)
      .flatMap((link) => {
        const permission = permissions.find((item) => item.id === link.permissionId);
        return permission
          ? [{ ...link, permission: { ...permission, description: permission.description ?? "" } }]
          : [];
      }),
  }));
}
export async function loadUserRoles(db: Database, userId: string) {
  const links = (await db.UserRole.find({ userId }).lean().exec()).map((row) => toEntity(row));
  return loadRoles(
    db,
    links.map((link) => link.roleId),
  );
}
export async function publicUser(db: Database, userId: string): Promise<PublicUser> {
  const row = await db.User.findById(userId).lean().exec();
  if (!row) throw new ApiError("NOT_FOUND", { message: "User not found." });
  const user = toEntity(row);
  const roles = await loadUserRoles(db, user.id);
  return {
    id: user.id,
    name: formatDisplayName({
      name: user.name,
      firstName: user.firstName ?? undefined,
      middleName: user.middleName ?? undefined,
      lastName: user.lastName ?? undefined,
      suffix: user.suffix ?? undefined,
    }),
    email: user.email,
    image: user.image ?? null,
    firstName: user.firstName ?? undefined,
    middleName: user.middleName ?? undefined,
    lastName: user.lastName ?? undefined,
    suffix: user.suffix ?? undefined,
    alumniId: user.alumniId ?? null,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    userRoles: roles.map((role) => ({
      roleId: role.id,
      role: { id: role.id, key: role.key, name: role.name },
    })),
  };
}
export function assertRoleScope(actor: AuthUser, roles: RoleScope[]) {
  for (const role of roles) {
    if ((role.key === "super_admin" || role.isSystem) && !actor.roles.includes("super_admin"))
      throw new ApiError("FORBIDDEN", {
        message: "Only a super administrator can manage system roles.",
      });
    if (
      role.rolePermissions.some(
        ({ permission }) =>
          !permission.key.startsWith("faculties.") && !actor.permissions.includes(permission.key),
      )
    )
      throw new ApiError("FORBIDDEN", {
        message: "You cannot manage access beyond your own permissions.",
      });
  }
}
export async function validateRoleIds(db: Database, actor: AuthUser, ids: string[]) {
  const roles = await loadRoles(db, ids);
  if (roles.length !== ids.length || new Set(ids).size !== ids.length)
    throw new ApiError("BAD_REQUEST", {
      message: "One or more roles no longer exist or were repeated.",
    });
  assertRoleScope(actor, roles);
  return roles;
}
export async function validatePermissionIds(db: Database, actor: AuthUser, ids: string[]) {
  const permissions = await db.Permission.find({ _id: { $in: ids } })
    .lean()
    .exec();
  if (permissions.length !== ids.length || new Set(ids).size !== ids.length)
    throw new ApiError("BAD_REQUEST", {
      message: "One or more permissions no longer exist or were repeated.",
    });
  if (permissions.some(({ key }) => !isPermissionKey(key) || !actor.permissions.includes(key)))
    throw new ApiError("FORBIDDEN", { message: "You cannot grant permissions you do not hold." });
}
export async function authorizationTransaction<T>(
  db: Database,
  work: (tx: Database) => Promise<T>,
): Promise<T> {
  try {
    return await db.transaction(work);
  } catch (error) {
    if (typeof error === "object" && error) {
      if ("code" in error && error.code === 11000)
        throw new ApiError("CONFLICT", {
          message: "An account or role with this identifier already exists.",
        });
      if (
        ("code" in error && error.code === 112) ||
        ("hasErrorLabel" in error &&
          typeof error.hasErrorLabel === "function" &&
          error.hasErrorLabel("TransientTransactionError"))
      )
        throw new ApiError("CONFLICT", {
          message: "Access changed during this save. Reload and try again.",
        });
    }
    throw error;
  }
}
