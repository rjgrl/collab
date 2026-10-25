import { usersSchemas, type UserInput } from "@Alumni-Tracking-Ss/contracts/users";
import {
  formatDisplayName,
  isAdministrator,
  isAlumniAccount,
} from "@Alumni-Tracking-Ss/contracts/names";
import { hashPassword, toEntity } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { requireAccess, rejectAlumniManagement } from "@Alumni-Tracking-Ss/api/access";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { writeAudit, describeAuditChanges } from "@Alumni-Tracking-Ss/api/audit";
import {
  assertRoleScope,
  authorizationTransaction,
  loadUserRoles,
  publicUser,
  validateRoleIds,
} from "@Alumni-Tracking-Ss/api/services/authorization";
import { updateAccountNames } from "@Alumni-Tracking-Ss/api/services/account-names";
import { assertPasswordSafe } from "@Alumni-Tracking-Ss/api/services/password-security";

export const usersService = {
  async list(context: Context, input: UserInput<"list">) {
    rejectAlumniManagement(context);
    requireAccess(context, "users.read");
    const search = input.search?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rows = await context.db.User.find(
      search
        ? {
            $or: [
              { name: { $regex: search, $options: "i" } },
              { email: { $regex: search, $options: "i" } },
            ],
          }
        : {},
    )
      .sort({ createdAt: -1, _id: -1 })
      .skip((input.page - 1) * input.pageSize)
      .limit(input.pageSize)
      .select({ _id: 1 })
      .lean()
      .exec();
    return Promise.all(rows.map((row) => publicUser(context.db, String(row._id))));
  },
  async create(context: Context, input: UserInput<"create">) {
    rejectAlumniManagement(context);
    const actor = requireAccess(context, "users.write");
    if (!isAdministrator(actor))
      throw new ApiError("FORBIDDEN", {
        message: "Only administrators can create managed accounts.",
      });
    input = usersSchemas.create.input.parse(input);
    await assertPasswordSafe(input.password);
    const passwordHash = await hashPassword(input.password);
    return authorizationTransaction(context.db, async (tx) => {
      let roleIds = input.roleIds;
      if (!roleIds) {
        const role = await tx.Role.findOne({ key: "staff" }).lean();
        if (!role)
          throw new ApiError("INTERNAL_SERVER_ERROR", { message: "Roles are not seeded." });
        roleIds = [String(role._id)];
      }
      const roles = await validateRoleIds(tx, actor, roleIds);
      if (roles.some((role) => role.key !== "staff" && role.key !== "super_admin"))
        throw new ApiError("BAD_REQUEST", {
          message:
            "Managed accounts may only have Staff or Super Admin roles. Alumni must self-register.",
        });
      const email = input.email.toLowerCase();
      if (await tx.User.findOne({ email }).lean().exec())
        throw new ApiError("CONFLICT", { message: "Email is already in use." });
      const { firstName, middleName, lastName, suffix } = input;
      const row = await tx.User.create({
        firstName,
        middleName,
        lastName,
        suffix,
        name: formatDisplayName(input),
        email,
        passwordHash,
        alumniId: null,
        verificationRequired: true,
        needsProfileCompletion: true,
      });
      const user = toEntity(row.toObject());
      await tx.UserRole.insertMany(
        roleIds.map((roleId) => ({ userId: user.id, roleId })),
        { ordered: true },
      );
      await writeAudit(tx, {
        actor,
        action: "users.create",
        entity: "user",
        entityId: user.id,
        summary: `Created account ${JSON.stringify(user.name)} (${user.email}) with roles ${roles.map((role) => role.name).join(", ")}`,
        ipAddress: context.ipAddress,
      });
      return publicUser(tx, user.id);
    });
  },
  async update(context: Context, input: UserInput<"update">) {
    rejectAlumniManagement(context);
    const actor = requireAccess(context, "users.write");
    if (input.password) await assertPasswordSafe(input.password);
    const passwordHash = input.password ? await hashPassword(input.password) : undefined;
    return authorizationTransaction(context.db, async (tx) => {
      const row = await tx.User.findById(input.id).lean().exec();
      if (!row) throw new ApiError("NOT_FOUND", { message: "User not found." });
      const current = toEntity(row);
      const roles = await loadUserRoles(tx, input.id);
      assertRoleScope(actor, roles);
      if (input.roleIds) {
        if (roles.some((role) => role.key === "super_admin"))
          throw new ApiError("FORBIDDEN", {
            message: "Super administrator role assignments are protected.",
          });
        const nextRoles = await validateRoleIds(tx, actor, input.roleIds);
        const currentKeys = roles.map((role) => role.key);
        const nextKeys = nextRoles.map((role) => role.key);
        if (
          nextKeys.some(
            (key) => (key === "viewer" || key === "alumni") && !currentKeys.includes(key),
          ) ||
          (!isAlumniAccount({ roles: currentKeys }) && isAlumniAccount({ roles: nextKeys }))
        )
          throw new ApiError("BAD_REQUEST", {
            message:
              "Alumni accounts must self-register; managed accounts cannot be converted to Alumni.",
          });
      }
      const { firstName, middleName, lastName, suffix } = input;
      const names = Object.fromEntries(
        Object.entries({ firstName, middleName, lastName, suffix }).filter(
          ([, value]) => value !== undefined,
        ),
      );
      if (Object.keys(names).length)
        await updateAccountNames(tx, input.id, names, passwordHash ? { passwordHash } : {});
      else {
        const claimed = await tx.User.updateOne(
          { _id: input.id, updatedAt: current.updatedAt },
          {
            $set: {
              ...(passwordHash ? { passwordHash } : {}),
              updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)),
            },
          },
          { timestamps: false },
        ).exec();
        if (claimed.modifiedCount !== 1)
          throw new ApiError("CONFLICT", { message: "Account changed. Reload before saving." });
      }
      if (input.roleIds) {
        await tx.UserRole.deleteMany({ userId: input.id }).exec();
        if (input.roleIds.length)
          await tx.UserRole.insertMany(
            input.roleIds.map((roleId) => ({ userId: input.id, roleId })),
            { ordered: true },
          );
      }
      if (passwordHash || input.roleIds) await tx.Session.deleteMany({ userId: input.id }).exec();
      await writeAudit(tx, {
        actor,
        action: "users.update",
        entity: "user",
        entityId: input.id,
        summary: `Updated account ${JSON.stringify(current.name)} (${current.email}): ${describeAuditChanges({ ...current, roleIds: roles.map((role) => role.id).sort() }, { ...names, ...(input.roleIds ? { roleIds: [...input.roleIds].sort() } : {}) })}${passwordHash ? "; changed password (value omitted)" : ""}`,
        ipAddress: context.ipAddress,
      });
      return publicUser(tx, input.id);
    });
  },
  async setStatus(context: Context, input: UserInput<"setStatus">) {
    rejectAlumniManagement(context);
    const actor = requireAccess(context, "users.delete");
    return authorizationTransaction(context.db, async (tx) => {
      const target = await tx.User.findById(input.id).lean().exec();
      if (!target) throw new ApiError("NOT_FOUND", { message: "User not found." });
      const roles = await loadUserRoles(tx, input.id);
      assertRoleScope(actor, roles);
      if (roles.some((role) => role.key === "super_admin"))
        throw new ApiError("FORBIDDEN", {
          message: "Super administrator accounts cannot be disabled here.",
        });
      const changed = await tx.User.updateOne(
        { _id: input.id, updatedAt: target.updatedAt },
        {
          $set: {
            status: input.status,
            updatedAt: new Date(Math.max(Date.now(), target.updatedAt.getTime() + 1)),
          },
        },
        { timestamps: false },
      ).exec();
      if (changed.modifiedCount !== 1)
        throw new ApiError("CONFLICT", { message: "Account changed. Reload before saving." });
      if (input.status === "disabled") await tx.Session.deleteMany({ userId: input.id }).exec();
      await writeAudit(tx, {
        actor,
        action: "users.status",
        entity: "user",
        entityId: input.id,
        summary: `Account ${JSON.stringify(target.name)} (${target.email}): ${describeAuditChanges(target, { status: input.status })}`,
        ipAddress: context.ipAddress,
      });
      return publicUser(tx, input.id);
    });
  },
};
