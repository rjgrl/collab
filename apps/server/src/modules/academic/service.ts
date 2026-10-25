import { toEntity } from "@Alumni-Tracking-Ss/db";
import type { Database, PermissionKey } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { requireAccess, rejectAlumniManagement } from "@Alumni-Tracking-Ss/api/access";
import { departmentsSchemas, programsSchemas } from "@Alumni-Tracking-Ss/contracts/academic";
import type { z } from "zod";
import { writeAudit, describeAuditChanges } from "@Alumni-Tracking-Ss/api/audit";
export const active = { deletedAt: null };
export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function management(context: Context, permission: PermissionKey) {
  const user = requireAccess(context, permission);
  rejectAlumniManagement(context);
  return user;
}
export async function audit(
  db: Database,
  context: Context,
  action: string,
  entity: string,
  entityId: string,
  summary: string,
) {
  await writeAudit(db, {
    actor: context.user,
    action,
    entity,
    entityId,
    summary,
    ipAddress: context.ipAddress,
  });
}
export async function activeDepartment(db: Database, id: string) {
  const row = await db.Department.findOne({ _id: id, ...active }).lean();
  if (!row) throw new ApiError("BAD_REQUEST", { message: "Active department not found." });
  return toEntity(row);
}
export async function activeProgram(db: Database, id: string) {
  const row = await db.Program.findOne({ _id: id, ...active }).lean();
  if (!row) throw new ApiError("BAD_REQUEST", { message: "Active program not found." });
  const program = toEntity(row);
  const department = await activeDepartment(db, String(program.departmentId));
  return { ...program, department };
}
export async function entityProgram(db: Database, id: string) {
  const row = await db.Program.findById(id).lean();
  if (!row) throw new ApiError("NOT_FOUND", { message: "Program not found." });
  const p = toEntity(row);
  const d = await db.Department.findById(p.departmentId).lean();
  if (!d) throw new ApiError("NOT_FOUND", { message: "Department not found." });
  return { ...p, department: toEntity(d) };
}
async function uniqueProgram(db: Database, code: string, departmentId: string, id?: string) {
  if (await db.Program.exists({ code, departmentId, ...(id ? { _id: { $ne: id } } : {}) }))
    throw new ApiError("CONFLICT", { message: "Program code already exists in this department." });
}
export const departmentsService = {
  async list(context: Context, input?: z.input<typeof departmentsSchemas.list.input>) {
    management(context, "departments.read");
    const p = departmentsSchemas.list.input.parse(input) ?? { page: 1, pageSize: 20 };
    const q = p.search
      ? {
          $or: [
            { name: { $regex: escapeRegex(p.search), $options: "i" } },
          ],
        }
      : {};
    const rows = await context.db.Department.find({ ...active, ...q })
      .sort({ name: 1, _id: 1 })
      .skip((p.page - 1) * p.pageSize)
      .limit(p.pageSize)
      .lean();
    return Promise.all(
      rows.map(async (row) => {
        const d = toEntity(row);
        return {
          ...d,
          _count: {
            programs: await context.db.Program.countDocuments({ departmentId: d.id, ...active }),
          },
        };
      }),
    );
  },
  async get(context: Context, input: z.input<typeof departmentsSchemas.get.input>) {
    management(context, "departments.read");
    const { id } = departmentsSchemas.get.input.parse(input);
    const d = await context.db.Department.findOne({ _id: id, ...active }).lean();
    if (!d) throw new ApiError("NOT_FOUND", { message: "Department not found." });
    const programs = await context.db.Program.find({ departmentId: id, ...active })
      .sort({ name: 1, _id: 1 })
      .lean();
    return { ...toEntity(d), programs: programs.map(toEntity) };
  },
  async create(context: Context, input: z.input<typeof departmentsSchemas.create.input>) {
    management(context, "departments.write");
    const data = departmentsSchemas.create.input.parse(input);
    return context.db.transaction(async (tx) => {
      const row = toEntity((await tx.Department.create(data)).toObject());
      await audit(
        tx,
        context,
        "departments.create",
        "department",
        row.id,
        `Created department ${JSON.stringify(row.name)}`,
      );
      return row;
    });
  },
  async update(context: Context, input: z.input<typeof departmentsSchemas.update.input>) {
    management(context, "departments.write");
    const { id, ...data } = departmentsSchemas.update.input.parse(input);
    return context.db.transaction(async (tx) => {
      const before = await activeDepartment(tx, id);
      const row = await tx.Department.findOneAndUpdate(
        { _id: id, ...active },
        { $set: data },
        { new: true, runValidators: true },
      ).lean();
      if (!row) throw new ApiError("NOT_FOUND");
      await audit(
        tx,
        context,
        "departments.update",
        "department",
        id,
        `Updated department ${JSON.stringify(before.name)}: ${describeAuditChanges(before, data)}`,
      );
      return toEntity(row);
    });
  },
  async delete(context: Context, input: z.input<typeof departmentsSchemas.delete.input>) {
    management(context, "departments.delete");
    const { id } = departmentsSchemas.delete.input.parse(input);
    return context.db.transaction(async (tx) => {
      const department = await activeDepartment(tx, id);
      await tx.Department.updateOne({ _id: id, ...active }, { $set: { deletedAt: new Date() } });
      await audit(
        tx,
        context,
        "departments.delete",
        "department",
        id,
        `Archived department ${JSON.stringify(department.name)}`,
      );
      return { ok: true };
    });
  },
};
export const programsService = {
  async list(context: Context, input?: z.input<typeof programsSchemas.list.input>) {
    management(context, "programs.read");
    const p = programsSchemas.list.input.parse(input) ?? { page: 1, pageSize: 20 };
    const departments = await context.db.Department.find({
      ...active,
      ...(p.departmentId ? { _id: p.departmentId } : {}),
    })
      .select("_id")
      .lean();
    const q = p.search
      ? {
          $or: [
            { name: { $regex: escapeRegex(p.search), $options: "i" } },
            { code: { $regex: escapeRegex(p.search), $options: "i" } },
          ],
        }
      : {};
    const rows = await context.db.Program.find({
      ...active,
      departmentId: { $in: departments.map((d) => d._id) },
      ...q,
    })
      .sort({ name: 1, _id: 1 })
      .skip((p.page - 1) * p.pageSize)
      .limit(p.pageSize)
      .lean();
    return Promise.all(
      rows.map(async (r) => {
        const p = toEntity(r);
        return {
          ...(await entityProgram(context.db, p.id)),
          _count: {
            alumni: await context.db.Alumni.countDocuments({ programId: p.id, ...active }),
          },
        };
      }),
    );
  },
  async get(context: Context, input: z.input<typeof programsSchemas.get.input>) {
    management(context, "programs.read");
    const { id } = programsSchemas.get.input.parse(input);
    return activeProgram(context.db, id);
  },
  async create(context: Context, input: z.input<typeof programsSchemas.create.input>) {
    management(context, "programs.write");
    const data = programsSchemas.create.input.parse(input);
    return context.db.transaction(async (tx) => {
      const department = await activeDepartment(tx, data.departmentId);
      await uniqueProgram(tx, data.code, data.departmentId);
      const p = toEntity((await tx.Program.create(data)).toObject());
      await audit(
        tx,
        context,
        "programs.create",
        "program",
        p.id,
        `Created program ${JSON.stringify(p.name)} (${p.code}) in ${JSON.stringify(department.name)}`,
      );
      return { ...p, department };
    });
  },
  async update(context: Context, input: z.input<typeof programsSchemas.update.input>) {
    management(context, "programs.write");
    const { id, ...data } = programsSchemas.update.input.parse(input);
    return context.db.transaction(async (tx) => {
      const before = await activeProgram(tx, id);
      const department = await activeDepartment(tx, data.departmentId);
      await uniqueProgram(tx, data.code, data.departmentId, id);
      const row = await tx.Program.findOneAndUpdate(
        { _id: id, ...active },
        { $set: data },
        { new: true, runValidators: true },
      ).lean();
      if (!row) throw new ApiError("NOT_FOUND");
      await audit(
        tx,
        context,
        "programs.update",
        "program",
        id,
        `Updated program ${JSON.stringify(before.name)}: ${describeAuditChanges(before, data)}`,
      );
      return { ...toEntity(row), department };
    });
  },
  async delete(context: Context, input: z.input<typeof programsSchemas.delete.input>) {
    management(context, "programs.delete");
    const { id } = programsSchemas.delete.input.parse(input);
    return context.db.transaction(async (tx) => {
      const row = await tx.Program.findOneAndUpdate(
        { _id: id, ...active },
        { $set: { deletedAt: new Date() } },
        { new: true },
      ).lean();
      if (!row) throw new ApiError("NOT_FOUND");
      await audit(
        tx,
        context,
        "programs.delete",
        "program",
        id,
        `Archived program ${JSON.stringify(row.name)} (${row.code})`,
      );
      return { ok: true };
    });
  },
};
