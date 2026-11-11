import { toEntity } from "@Alumni-Tracking-Ss/db";
import type { Database, PermissionKey } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { requireAccess, rejectAlumniManagement } from "@Alumni-Tracking-Ss/api/access";
import {
  collegesSchemas,
  departmentsSchemas,
  programsSchemas,
} from "@Alumni-Tracking-Ss/contracts/academic";
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
  metadata?: Record<string, unknown>,
) {
  await writeAudit(db, {
    actor: context.user,
    action,
    entity,
    entityId,
    summary,
    metadata,
    ipAddress: context.ipAddress,
  });
}
export async function activeCollege(db: Database, id: string) {
  const row = await db.College.findOne({ _id: id, ...active }).lean();
  if (!row) throw new ApiError("BAD_REQUEST", { message: "Active college not found." });
  return toEntity(row);
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
export const collegesService = {
  async list(context: Context, input?: z.input<typeof collegesSchemas.list.input>) {
    management(context, "departments.read");
    const p = collegesSchemas.list.input.parse(input) ?? { page: 1, pageSize: 20 };
    const q = p.search ? { name: { $regex: escapeRegex(p.search), $options: "i" } } : {};
    const rows = await context.db.College.find({ ...active, ...q })
      .sort({ name: 1, _id: 1 })
      .skip((p.page - 1) * p.pageSize)
      .limit(p.pageSize)
      .lean();
    return Promise.all(
      rows.map(async (row) => {
        const c = toEntity(row);
        return {
          ...c,
          _count: {
            departments: await context.db.Department.countDocuments({ collegeId: c.id, ...active }),
          },
        };
      }),
    );
  },
};
export const collegeWriteService = {
  async create(context: Context, input: z.input<typeof collegesSchemas.create.input>) {
    management(context, "departments.write");
    const data = collegesSchemas.create.input.parse(input);
    return context.db.transaction(async (tx) => {
      const row = toEntity((await tx.College.create(data)).toObject());
      await audit(
        tx,
        context,
        "colleges.create",
        "college",
        row.id,
        `Created college ${JSON.stringify(row.name)}`,
      );
      return { ...row, _count: { departments: 0 } };
    });
  },
  async update(context: Context, input: z.input<typeof collegesSchemas.update.input>) {
    management(context, "departments.write");
    const { id, ...data } = collegesSchemas.update.input.parse(input);
    return context.db.transaction(async (tx) => {
      const before = await activeCollege(tx, id);
      const row = await tx.College.findOneAndUpdate(
        { _id: id, ...active },
        { $set: data },
        { returnDocument: "after", runValidators: true },
      ).lean();
      if (!row) throw new ApiError("NOT_FOUND");
      await audit(
        tx,
        context,
        "colleges.update",
        "college",
        id,
        `Updated college ${JSON.stringify(before.name)}: ${describeAuditChanges(before, data)}`,
      );
      return {
        ...toEntity(row),
        _count: { departments: await tx.Department.countDocuments({ collegeId: id, ...active }) },
      };
    });
  },
  async delete(context: Context, input: z.input<typeof collegesSchemas.delete.input>) {
    management(context, "departments.delete");
    const { id } = collegesSchemas.delete.input.parse(input);
    return context.db.transaction(async (tx) => {
      const college = await activeCollege(tx, id);
      await blockIfInUse(
        [[await tx.Department.countDocuments({ collegeId: id, ...active }), "department"]],
        "college",
      );
      await tx.College.updateOne({ _id: id, ...active }, { $set: { deletedAt: new Date() } });
      await audit(
        tx,
        context,
        "colleges.delete",
        "college",
        id,
        `Archived college ${JSON.stringify(college.name)}`,
      );
      return { ok: true };
    });
  },
};
/** Archiving is blocked while anything still hangs off the node; the message says what. */
async function blockIfInUse(counts: [number, string][], entity: string) {
  const blockers = counts
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}${count === 1 ? "" : "s"}`);
  if (blockers.length)
    throw new ApiError("CONFLICT", {
      message: `This ${entity} still has ${blockers.join(", ")}. Move or archive them first.`,
    });
}
export const departmentsService = {
  async list(context: Context, input?: z.input<typeof departmentsSchemas.list.input>) {
    management(context, "departments.read");
    const p = departmentsSchemas.list.input.parse(input) ?? { page: 1, pageSize: 20 };
    const q = p.search
      ? {
          $or: [{ name: { $regex: escapeRegex(p.search), $options: "i" } }],
        }
      : {};
    const rows = await context.db.Department.find({
      ...active,
      ...(p.collegeId ? { collegeId: p.collegeId } : {}),
      ...q,
    })
      .sort({ name: 1, _id: 1 })
      .skip((p.page - 1) * p.pageSize)
      .limit(p.pageSize)
      .lean();
    const colleges = new Map(
      (
        await context.db.College.find({ _id: { $in: rows.map((row) => row.collegeId) } })
          .select("_id name")
          .lean()
      ).map((college) => [String(college._id), { id: String(college._id), name: college.name }]),
    );
    return Promise.all(
      rows.map(async (row) => {
        const d = toEntity(row);
        return {
          ...d,
          college: colleges.get(String(d.collegeId)),
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
      await activeCollege(tx, data.collegeId);
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
      if (data.collegeId) await activeCollege(tx, data.collegeId);
      const row = await tx.Department.findOneAndUpdate(
        { _id: id, ...active },
        { $set: data },
        { returnDocument: "after", runValidators: true },
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
      await blockIfInUse(
        [
          [await tx.Program.countDocuments({ departmentId: id, ...active }), "program"],
          [
            await tx.Faculty.countDocuments({ departmentId: id, ...active, active: true }),
            "active faculty member",
          ],
        ],
        "department",
      );
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
        { returnDocument: "after", runValidators: true },
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
      await blockIfInUse(
        [[await tx.Alumni.countDocuments({ programId: id, ...active }), "alumni record"]],
        "program",
      );
      const row = await tx.Program.findOneAndUpdate(
        { _id: id, ...active },
        { $set: { deletedAt: new Date() } },
        { returnDocument: "after" },
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
