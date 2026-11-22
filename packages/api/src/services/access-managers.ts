import type { Database } from "@Alumni-Tracking-Ss/db";
import { ROLE } from "@Alumni-Tracking-Ss/contracts/names";
import { ApiError } from "../http-error";

export const ACCESS_MANAGER_PERMISSIONS = [
  "users.read",
  "users.write",
  "roles.read",
  "roles.write",
  "permissions.read",
] as const;

export async function roleAffectsSuperAdmins(db: Database, roleId: string) {
  const members = await db.UserRole.find({ roleId }).select("userId").lean().exec();
  if (!members.length) return false;
  const adminRoles = await db.Role.find({
    $or: [{ key: ROLE.superAdmin }, { baseRole: ROLE.superAdmin }],
  })
    .select("_id")
    .lean()
    .exec();
  return Boolean(
    await db.UserRole.exists({
      userId: { $in: members.map((link) => link.userId) },
      roleId: { $in: adminRoles.map((role) => role._id) },
    }),
  );
}

/** Call inside the same transaction before any Super Admin access change. */
export async function lockAccessManagers(db: Database) {
  await db.AuthThrottle.findOneAndUpdate(
    { key: "rbac:access-managers" },
    { $inc: { count: 1 }, $set: { expiresAt: new Date(Date.now() + 86_400_000) } },
    { upsert: true, returnDocument: "after" },
  ).exec();
}

/** Call after the mutation, before committing the transaction holding the coordination write. */
export async function assertAccessManagerRemains(db: Database) {
  const roles = await db.Role.find({
    $or: [{ key: ROLE.superAdmin }, { baseRole: ROLE.superAdmin }],
  })
    .lean()
    .exec();
  const catalog = await db.Permission.find({ key: { $in: ACCESS_MANAGER_PERMISSIONS } })
    .lean()
    .exec();
  if (catalog.length === ACCESS_MANAGER_PERMISSIONS.length) {
    const adminLinks = await db.UserRole.find({ roleId: { $in: roles.map((role) => role._id) } })
      .lean()
      .exec();
    const links = await db.UserRole.find({ userId: { $in: adminLinks.map((link) => link.userId) } })
      .lean()
      .exec();
    const grants = await db.RolePermission.find({
      roleId: { $in: links.map((link) => link.roleId) },
    })
      .lean()
      .exec();
    const users = await db.User.find({
      _id: { $in: adminLinks.map((link) => link.userId) },
      status: "active",
    })
      .lean()
      .exec();
    for (const user of users) {
      const roleIds = new Set(
        links
          .filter((link) => String(link.userId) === String(user._id))
          .map((link) => String(link.roleId)),
      );
      const permissions = new Set(
        grants
          .filter((grant) => roleIds.has(String(grant.roleId)))
          .map((grant) => String(grant.permissionId)),
      );
      if (catalog.every((permission) => permissions.has(String(permission._id)))) return;
    }
  }
  throw new ApiError("FORBIDDEN", {
    message:
      "Keep at least one active Super Admin with user, role and permission management access.",
  });
}
