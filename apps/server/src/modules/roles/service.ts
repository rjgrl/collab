import { randomBytes } from "node:crypto";
import { ROLE, formatDisplayName } from "@Alumni-Tracking-Ss/contracts/names";
import type { RoleInput } from "@Alumni-Tracking-Ss/contracts/roles";
import { toEntity, isPermissionKey, RESERVED_ROLE_KEYS } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { requireAccess } from "@Alumni-Tracking-Ss/api/access";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { writeAudit, describeAuditChanges } from "@Alumni-Tracking-Ss/api/audit";
import {
  assertSuperAdmin,
  assertRoleScope,
  authorizationTransaction,
  isSuperAdminKind,
  loadRoles,
  validatePermissionIds,
} from "@Alumni-Tracking-Ss/api/services/authorization";
import type { Database } from "@Alumni-Tracking-Ss/db";
import {
  lockAccessManagers,
  assertAccessManagerRemains,
  roleAffectsSuperAdmins,
} from "@Alumni-Tracking-Ss/api/services/access-managers";

/** Member names for roles that can be split; Alumni is excluded (one entry per graduate). */
async function roleMembers(db: Database, roleId: string) {
  const links = await db.UserRole.find({ roleId }).select("userId").lean().exec();
  const users = await db.User.find({ _id: { $in: links.map((link) => link.userId) } })
    .select("name firstName middleName lastName suffix email")
    .sort({ lastName: 1, firstName: 1, name: 1 })
    .lean()
    .exec();
  return users.map((user) => ({
    id: String(user._id),
    email: user.email,
    name: formatDisplayName({
      name: user.name,
      firstName: user.firstName ?? undefined,
      middleName: user.middleName ?? undefined,
      lastName: user.lastName ?? undefined,
      suffix: user.suffix ?? undefined,
    }),
  }));
}
/** Which kind of account a role (or a role split from it) gives its members. */
function baseOf(role: { key: string; baseRole?: string | null }) {
  if (role.baseRole) return role.baseRole;
  return role.key === ROLE.superAdmin || role.key === ROLE.faculty ? role.key : null;
}

export const rolesService = {
  async list(context: Context, _input: RoleInput<"list">) {
    requireAccess(context, "roles.read");
    const roles = await loadRoles(context.db);
    return Promise.all(
      roles.map(async (role) => ({
        ...role,
        rolePermissions: role.rolePermissions.filter(({ permission }) =>
          isPermissionKey(permission.key),
        ),
        _count: { userRoles: await context.db.UserRole.countDocuments({ roleId: role.id }).exec() },
        members: role.key === ROLE.alumni ? [] : await roleMembers(context.db, role.id),
      })),
    );
  },
  async create(context: Context, input: RoleInput<"create">) {
    const actor = requireAccess(context, "roles.write");
    return authorizationTransaction(context.db, async (tx) => {
      // System roles keep their keys; removed keys (admin, staff, viewer) can never return.
      if ((RESERVED_ROLE_KEYS as readonly string[]).includes(input.key))
        throw new ApiError("FORBIDDEN", { message: "Reserved role key." });
      await validatePermissionIds(tx, actor, input.permissionIds);
      const row = await tx.Role.create({
        key: input.key,
        name: input.name,
        description: input.description ?? "",
      });
      const role = toEntity(row.toObject());
      if (input.permissionIds.length)
        await tx.RolePermission.insertMany(
          input.permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
          { ordered: true },
        );
      await writeAudit(tx, {
        actor,
        action: "roles.create",
        entity: "role",
        entityId: role.id,
        summary: "Created role " + role.name,
        ipAddress: context.ipAddress,
      });
      return (await loadRoles(tx, [role.id]))[0]!;
    });
  },
  async update(context: Context, input: RoleInput<"update">) {
    const actor = requireAccess(context, "roles.write");
    return authorizationTransaction(context.db, async (tx) => {
      const current = (await loadRoles(tx, [input.id]))[0];
      if (!current) throw new ApiError("NOT_FOUND", { message: "Role not found." });
      assertRoleScope(actor, [current]);
      const affectsAdmins =
        isSuperAdminKind(current) || (await roleAffectsSuperAdmins(tx, current.id));
      if (affectsAdmins) assertSuperAdmin(actor);
      const protectsAccess = affectsAdmins && input.permissionIds !== undefined;
      if (protectsAccess) await lockAccessManagers(tx);
      if (input.permissionIds) await validatePermissionIds(tx, actor, input.permissionIds);
      const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
      const set = {
        updatedAt,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      };
      const claimed = await tx.Role.updateOne(
        { _id: input.id, updatedAt: new Date(input.expectedUpdatedAt) },
        { $set: set },
        { timestamps: false },
      ).exec();
      if (claimed.modifiedCount !== 1)
        throw new ApiError("CONFLICT", {
          message: "This role changed. Reload the latest permissions before saving.",
        });
      if (input.permissionIds) {
        await tx.RolePermission.deleteMany({ roleId: input.id }).exec();
        if (input.permissionIds.length)
          await tx.RolePermission.insertMany(
            input.permissionIds.map((permissionId) => ({ roleId: input.id, permissionId })),
            { ordered: true },
          );
      }
      if (protectsAccess) await assertAccessManagerRemains(tx);
      const role = (await loadRoles(tx, [input.id]))[0]!;
      const beforePermissionKeys = current.rolePermissions
        .map(({ permission }) => permission.key)
        .sort();
      const afterPermissionKeys = role.rolePermissions
        .map(({ permission }) => permission.key)
        .sort();
      const permissionsChanged =
        beforePermissionKeys.length !== afterPermissionKeys.length ||
        beforePermissionKeys.some((key, index) => key !== afterPermissionKeys[index]);
      // Role notes and names do not affect authorization. Revoke sessions only when the effective
      // permission set changes, so an editorial update does not sign out every assigned member.
      if (permissionsChanged) {
        const assigned = await tx.UserRole.find({ roleId: input.id }).lean().exec();
        if (assigned.length)
          await tx.Session.deleteMany({
            userId: { $in: assigned.map((link) => link.userId) },
          }).exec();
      }
      await writeAudit(tx, {
        actor,
        action: "roles.update",
        entity: "role",
        entityId: role.id,
        summary: `Saved role ${JSON.stringify(current.name)}: ${describeAuditChanges(
          {
            name: current.name,
            description: current.description,
            permissionKeys: current.rolePermissions.map(({ permission }) => permission.key).sort(),
          },
          {
            name: role.name,
            description: role.description,
            permissionKeys: role.rolePermissions.map(({ permission }) => permission.key).sort(),
          },
        )}`,
        metadata: {
          before: current.rolePermissions.map(({ permission }) => permission.key),
          after: role.rolePermissions.map(({ permission }) => permission.key),
        },
        ipAddress: context.ipAddress,
      });
      return role;
    });
  },
  async split(context: Context, input: RoleInput<"split">) {
    const actor = requireAccess(context, "roles.write");
    return authorizationTransaction(context.db, async (tx) => {
      const current = (await loadRoles(tx, [input.id]))[0];
      if (!current) throw new ApiError("NOT_FOUND", { message: "Role not found." });
      if (current.key === ROLE.alumni)
        throw new ApiError("BAD_REQUEST", { message: "Alumni accounts cannot be split." });
      const protectsAccess =
        isSuperAdminKind(current) || (await roleAffectsSuperAdmins(tx, current.id));
      if (protectsAccess) {
        assertSuperAdmin(actor);
        await lockAccessManagers(tx);
      }
      assertRoleScope(actor, [current]);
      if (current.updatedAt.toISOString() !== input.expectedUpdatedAt)
        throw new ApiError("CONFLICT", {
          message: "This role changed. Reload the latest permissions before saving.",
        });
      const userIds = [...new Set(input.userIds)];
      if (userIds.includes(actor.id))
        throw new ApiError("BAD_REQUEST", {
          message: "You cannot move yourself to a role with different permissions.",
        });
      const links = await tx.UserRole.find({ roleId: input.id }).select("userId").lean().exec();
      const members = links.map((link) => String(link.userId));
      if (userIds.some((id) => !members.includes(id)))
        throw new ApiError("BAD_REQUEST", {
          message: "One or more selected people are no longer members of this role.",
        });
      const baseRole = baseOf(current);
      await validatePermissionIds(tx, actor, input.permissionIds);
      const row = await tx.Role.create({
        key: `${current.key.slice(0, 50)}_${randomBytes(4).toString("hex")}`,
        name: input.name,
        description: input.description ?? "",
        baseRole,
      });
      const roleId = String(row._id);
      if (input.permissionIds.length)
        await tx.RolePermission.insertMany(
          input.permissionIds.map((permissionId) => ({ roleId, permissionId })),
          { ordered: true },
        );
      await tx.UserRole.updateMany(
        { roleId: input.id, userId: { $in: userIds } },
        { $set: { roleId } },
      ).exec();
      // Membership of the original role changed: stale editors must reload before saving.
      await tx.Role.updateOne(
        { _id: input.id },
        { $set: { updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)) } },
        { timestamps: false },
      ).exec();
      if (protectsAccess) await assertAccessManagerRemains(tx);
      await tx.Session.deleteMany({ userId: { $in: userIds } }).exec();
      const moved = await roleMembers(tx, roleId);
      const role = (await loadRoles(tx, [roleId]))[0]!;
      await writeAudit(tx, {
        actor,
        action: "roles.split",
        entity: "role",
        entityId: roleId,
        summary: `Moved ${moved.map((member) => member.name).join(", ")} from role ${JSON.stringify(current.name)} to new role ${JSON.stringify(role.name)}: ${describeAuditChanges(
          {
            permissionKeys: current.rolePermissions.map(({ permission }) => permission.key).sort(),
          },
          { permissionKeys: role.rolePermissions.map(({ permission }) => permission.key).sort() },
        )}`,
        metadata: {
          fromRoleId: input.id,
          userIds,
          before: current.rolePermissions.map(({ permission }) => permission.key),
          after: role.rolePermissions.map(({ permission }) => permission.key),
        },
        ipAddress: context.ipAddress,
      });
      return { ...role, members: moved };
    });
  },
  async delete(context: Context, input: RoleInput<"delete">) {
    const actor = requireAccess(context, "roles.delete");
    return authorizationTransaction(context.db, async (tx) => {
      const role = (await loadRoles(tx, [input.id]))[0];
      if (!role) throw new ApiError("NOT_FOUND", { message: "Role not found." });
      assertRoleScope(actor, [role]);
      if (role.isSystem)
        throw new ApiError("BAD_REQUEST", { message: "System roles cannot be deleted." });
      const protectsAccess = isSuperAdminKind(role) || (await roleAffectsSuperAdmins(tx, role.id));
      if (protectsAccess) {
        assertSuperAdmin(actor);
        await lockAccessManagers(tx);
      }
      const assigned = await tx.UserRole.find({ roleId: input.id }).lean().exec();
      const claimed = await tx.Role.deleteOne({ _id: input.id, updatedAt: role.updatedAt }).exec();
      if (claimed.deletedCount !== 1)
        throw new ApiError("CONFLICT", { message: "Role changed. Reload before deleting." });
      await tx.RolePermission.deleteMany({ roleId: input.id }).exec();
      await tx.UserRole.deleteMany({ roleId: input.id }).exec();
      if (protectsAccess) await assertAccessManagerRemains(tx);
      if (assigned.length)
        await tx.Session.deleteMany({
          userId: { $in: assigned.map((link) => link.userId) },
        }).exec();
      await writeAudit(tx, {
        actor,
        action: "roles.delete",
        entity: "role",
        entityId: role.id,
        summary: "Deleted role " + role.name,
        ipAddress: context.ipAddress,
      });
      return { ok: true };
    });
  },
};
export const permissionsService = {
  async list(context: Context, _input: Record<string, never>) {
    requireAccess(context, "permissions.read");
    return (await context.db.Permission.find({}).sort({ module: 1, key: 1 }).lean().exec())
      .filter((item) => isPermissionKey(item.key))
      .map((row) => toEntity(row));
  },
};
