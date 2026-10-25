import type { RoleInput } from "@Alumni-Tracking-Ss/contracts/roles";
import { toEntity, isPermissionKey } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { requireAccess, rejectAlumniManagement } from "@Alumni-Tracking-Ss/api/access";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { writeAudit, describeAuditChanges } from "@Alumni-Tracking-Ss/api/audit";
import {
  assertRoleScope,
  authorizationTransaction,
  loadRoles,
  validatePermissionIds,
} from "@Alumni-Tracking-Ss/api/services/authorization";

export const rolesService = {
  async list(context: Context, _input: RoleInput<"list">) {
    rejectAlumniManagement(context);
    requireAccess(context, "roles.read");
    const roles = await loadRoles(context.db);
    return Promise.all(
      roles.map(async (role) => ({
        ...role,
        rolePermissions: role.rolePermissions.filter(({ permission }) =>
          isPermissionKey(permission.key),
        ),
        _count: { userRoles: await context.db.UserRole.countDocuments({ roleId: role.id }).exec() },
      })),
    );
  },
  async create(context: Context, input: RoleInput<"create">) {
    rejectAlumniManagement(context);
    const actor = requireAccess(context, "roles.write");
    return authorizationTransaction(context.db, async (tx) => {
      if (input.key === "super_admin")
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
    rejectAlumniManagement(context);
    const actor = requireAccess(context, "roles.write");
    return authorizationTransaction(context.db, async (tx) => {
      const current = (await loadRoles(tx, [input.id]))[0];
      if (!current) throw new ApiError("NOT_FOUND", { message: "Role not found." });
      assertRoleScope(actor, [current]);
      if (current.key === "super_admin")
        throw new ApiError("FORBIDDEN", { message: "The super administrator role is protected." });
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
      const role = (await loadRoles(tx, [input.id]))[0]!;
      const assigned = await tx.UserRole.find({ roleId: input.id }).lean().exec();
      if (assigned.length)
        await tx.Session.deleteMany({
          userId: { $in: assigned.map((link) => link.userId) },
        }).exec();
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
  async delete(context: Context, input: RoleInput<"delete">) {
    rejectAlumniManagement(context);
    const actor = requireAccess(context, "roles.delete");
    return authorizationTransaction(context.db, async (tx) => {
      const role = (await loadRoles(tx, [input.id]))[0];
      if (!role) throw new ApiError("NOT_FOUND", { message: "Role not found." });
      assertRoleScope(actor, [role]);
      if (role.isSystem)
        throw new ApiError("BAD_REQUEST", { message: "System roles cannot be deleted." });
      const assigned = await tx.UserRole.find({ roleId: input.id }).lean().exec();
      const claimed = await tx.Role.deleteOne({ _id: input.id, updatedAt: role.updatedAt }).exec();
      if (claimed.deletedCount !== 1)
        throw new ApiError("CONFLICT", { message: "Role changed. Reload before deleting." });
      await tx.RolePermission.deleteMany({ roleId: input.id }).exec();
      await tx.UserRole.deleteMany({ roleId: input.id }).exec();
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
    rejectAlumniManagement(context);
    requireAccess(context, "permissions.read");
    return (await context.db.Permission.find({}).sort({ module: 1, key: 1 }).lean().exec())
      .filter((item) => isPermissionKey(item.key))
      .map((row) => toEntity(row));
  },
};
