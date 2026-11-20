import { isSuperAdminOnlyPermission } from "@Alumni-Tracking-Ss/contracts/permission-scope";
import { isPermissionKey, toEntity, type Database } from "@Alumni-Tracking-Ss/db";
import type { Role } from "@Alumni-Tracking-Ss/contracts/roles";
import type { PublicUser } from "@Alumni-Tracking-Ss/contracts/users";
import { formatDisplayName, ROLE, isAdministrator } from "@Alumni-Tracking-Ss/contracts/names";
import { ApiError } from "../http-error";
import type { AuthUser } from "../context";

export type RoleScope = {
  key: string;
  isSystem: boolean;
  baseRole?: string | null;
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
    name: role.key === ROLE.alumni ? "Alumni" : role.name,
    description: role.description ?? "",
    baseRole:
      role.baseRole === ROLE.superAdmin || role.baseRole === ROLE.faculty ? role.baseRole : null,
    members: [],
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
/**
 * Role keys an account counts as: each role's own key plus, for a role split from Super Admin or
 * Faculty, that base key. Use this wherever role keys decide what kind of account someone is.
 */
export function roleKeys(roles: { key: string; baseRole?: string | null }[]) {
  return [
    ...new Set(roles.flatMap((role) => (role.baseRole ? [role.key, role.baseRole] : [role.key]))),
  ];
}
/** The original Super Admin role or a limited one split from it. */
export function isSuperAdminKind(role: { key: string; baseRole?: string | null }) {
  return role.key === ROLE.superAdmin || role.baseRole === ROLE.superAdmin;
}
/** A member of the original, full-access Super Admin role (not a limited one). */
export async function isFullSuperAdmin(db: Database, userId: string) {
  const links = await db.UserRole.find({ userId }).select("roleId").lean().exec();
  return (
    links.length > 0 &&
    Boolean(
      await db.Role.exists({
        key: ROLE.superAdmin,
        _id: { $in: links.map((link) => link.roleId) },
      }),
    )
  );
}
export async function assertFullSuperAdmin(db: Database, actor: AuthUser) {
  if (!(await isFullSuperAdmin(db, actor.id)))
    throw new ApiError("FORBIDDEN", {
      message: "Only a full Super Admin can manage Super Admin access.",
    });
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
    if ((isSuperAdminKind(role) || role.isSystem) && !isAdministrator(actor))
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
export async function validatePermissionIds(
  db: Database,
  actor: AuthUser,
  ids: string[],
  target?: { key: string; baseRole?: string | null },
) {
  const permissions = await db.Permission.find({ _id: { $in: ids } })
    .lean()
    .exec();
  if (permissions.length !== ids.length || new Set(ids).size !== ids.length)
    throw new ApiError("BAD_REQUEST", {
      message: "One or more permissions no longer exist or were repeated.",
    });
  if (permissions.some(({ key }) => !isPermissionKey(key) || !actor.permissions.includes(key)))
    throw new ApiError("FORBIDDEN", { message: "You cannot grant permissions you do not hold." });
  // Only Super Admin roles (the original or a limited one split from it) may hold
  // university-wide permissions.
  if (
    !(target && isSuperAdminKind(target)) &&
    permissions.some(({ key }) => isSuperAdminOnlyPermission(key))
  )
    throw new ApiError("BAD_REQUEST", {
      message:
        "Managing members, roles, academic structure, integrations and the full audit log is for Super Admins only. Remove those permissions from this role.",
    });
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
