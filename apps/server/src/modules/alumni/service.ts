import { activeAlumni, linkedAlumni } from "./access";
export { activeAlumni } from "./access";
import { employmentService } from "./employment.service";
import { toEntity } from "@Alumni-Tracking-Ss/db";
import type { Database, UserRecord } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { requireAccess } from "@Alumni-Tracking-Ss/api/access";
import {
  isAdministrator,
  isAlumniAccount,
  formatDisplayName,
} from "@Alumni-Tracking-Ss/contracts/names";
import {
  alumniSchemas,
  meProfileSchemas,
  filesSchemas,
} from "@Alumni-Tracking-Ss/contracts/alumni";
import { objectIdSchema } from "@Alumni-Tracking-Ss/contracts/common";
import { describeAuditChanges } from "@Alumni-Tracking-Ss/api/audit";
import type { z } from "zod";
import {
  active,
  activeProgram,
  entityProgram,
  management,
  audit,
  escapeRegex,
} from "../academic/service";
export async function assertEvidenceReadAccess(context: Context, evidence: { alumniId: unknown }) {
  const user = requireAccess(context, "files.read");
  if (isAlumniAccount(user)) {
    const alumni = await linkedAlumni(context);
    if (alumni.id !== String(evidence.alumniId))
      throw new ApiError("FORBIDDEN", {
        message: "You may only read evidence for your own linked profile.",
      });
  }
  await activeAlumni(context.db, objectIdSchema.parse(String(evidence.alumniId)));
}
export const assertManagementAccess = management;
async function detail(context: Context, id: string, db = context.db, self = false) {
  const a = await activeAlumni(db, id);
  // This helper also runs inside mutations: MongoDB sessions do not support parallel operations.
  const program = await entityProgram(db, String(a.programId));
  const employments = await db.Employment.find({ alumniId: id })
    .sort({ isCurrent: -1, createdAt: -1 })
    .lean();
  const events = await db.TrackingEvent.find({ alumniId: id })
    .sort({ recordedAt: -1, _id: -1 })
    .lean();
  const files =
    self || context.user!.permissions.includes("files.read")
      ? await db.EvidenceFile.find({ alumniId: id, ...active })
          .select("_id originalName mimeType provider sizeBytes kind createdAt employmentId")
          .sort({ createdAt: -1, _id: -1 })
          .lean()
      : [];
  return {
    ...a,
    isRegistered: Boolean(await db.User.findOne({ alumniId: a.id }).select("_id").lean()),
    program,
    employments: employments.map(toEntity),
    trackingEvents: events.map(toEntity),
    evidenceFiles: files.map(toEntity),
  };
}
async function uniqueStudent(db: Database, studentNumber: string, id?: string) {
  if (await db.Alumni.exists({ studentNumber, ...(id ? { _id: { $ne: id } } : {}) }))
    throw new ApiError("CONFLICT", {
      message: "Student number already exists, including archived records.",
    });
}
export const alumniService = {
  async pendingAccounts(
    context: Context,
    input: z.input<typeof alumniSchemas.pendingAccounts.input>,
  ) {
    management(context, "alumni.read");
    const p = alumniSchemas.pendingAccounts.input.parse(input);
    const rows = await context.db.User.aggregate<
      Pick<UserRecord, "_id" | "name" | "email" | "createdAt">
    >([
      {
        $match: {
          alumniId: null,
          ...(p.search
            ? {
                $or: ["name", "email"].map((key) => ({
                  [key]: { $regex: escapeRegex(p.search!), $options: "i" },
                })),
              }
            : {}),
        },
      },
      {
        $lookup: { from: "UserRole", localField: "_id", foreignField: "userId", as: "assignments" },
      },
      {
        $lookup: {
          from: "Role",
          localField: "assignments.roleId",
          foreignField: "_id",
          as: "roles",
        },
      },
      {
        $match: {
          "roles.key": { $in: ["viewer", "alumni"], $nin: ["staff", "admin", "super_admin"] },
        },
      },
      { $sort: { createdAt: -1, _id: -1 } },
      { $skip: (p.page - 1) * p.pageSize },
      { $limit: p.pageSize },
      { $project: { _id: 1, name: 1, email: 1, createdAt: 1 } },
    ]).exec();
    return rows.map((row) => ({
      id: String(row._id),
      name: row.name,
      email: row.email,
      createdAt: row.createdAt,
    }));
  },
  async list(context: Context, input?: z.input<typeof alumniSchemas.list.input>) {
    management(context, "alumni.read");
    const p = alumniSchemas.list.input.parse(input) ?? { page: 1, pageSize: 20 };
    const departments = await context.db.Department.find({
      ...active,
      ...(p.departmentId ? { _id: p.departmentId } : {}),
    })
      .select("_id")
      .lean();
    const programs = await context.db.Program.find({
      ...active,
      departmentId: { $in: departments.map((d) => d._id) },
      ...(p.programId ? { _id: p.programId } : {}),
    })
      .select("_id")
      .lean();
    const q = {
      ...active,
      programId: { $in: programs.map((r) => r._id) },
      ...(p.graduationYear ? { graduationYear: p.graduationYear } : {}),
      ...(p.tracked && p.tracked !== "all" ? { isTracked: p.tracked === "tracked" } : {}),
      ...(p.search
        ? {
            $and: p.search.split(/\s+/).map((term) => ({
              $or: [
                "studentNumber",
                "firstName",
                "middleName",
                "lastName",
                "suffix",
                "personalEmail",
              ].map((key) => ({ [key]: { $regex: escapeRegex(term), $options: "i" } })),
            })),
          }
        : {}),
    };
    const rows = await context.db.Alumni.find(q)
      .sort({ lastName: 1, firstName: 1, _id: 1 })
      .skip((p.page - 1) * p.pageSize)
      .limit(p.pageSize)
      .lean();
    const owners = rows.length
      ? await context.db.User.find({ alumniId: { $in: rows.map((row) => row._id) } })
          .select("alumniId")
          .lean()
      : [];
    const registered = new Set(owners.map((owner) => String(owner.alumniId)));
    return Promise.all(
      rows.map(async (row) => {
        const a = toEntity(row);
        return {
          ...a,
          isRegistered: registered.has(a.id),
          program: await entityProgram(context.db, String(a.programId)),
        };
      }),
    );
  },
  async get(context: Context, input: z.input<typeof alumniSchemas.get.input>) {
    management(context, "alumni.read");
    const { id } = alumniSchemas.get.input.parse(input);
    return detail(context, id);
  },
  async create(context: Context, input: z.input<typeof alumniSchemas.create.input>) {
    management(context, "alumni.write");
    const data = alumniSchemas.create.input.parse(input);
    return context.db.transaction(async (tx) => {
      await activeProgram(tx, data.programId);
      await uniqueStudent(tx, data.studentNumber);
      const a = toEntity(
        (await tx.Alumni.create({ ...data, employmentStatus: "unknown" })).toObject(),
      );
      await audit(
        tx,
        context,
        "alumni.create",
        "alumni",
        a.id,
        `Created Alumni ${JSON.stringify(formatDisplayName(a))} (${a.studentNumber}), program ${data.programId}`,
      );
      return { ...a, program: await entityProgram(tx, String(a.programId)) };
    });
  },
  async update(context: Context, input: z.input<typeof alumniSchemas.update.input>) {
    management(context, "alumni.write");
    const { id, ...data } = alumniSchemas.update.input.parse(input);
    return context.db.transaction(async (tx) => {
      const before = await activeAlumni(tx, id);
      await activeProgram(tx, data.programId);
      await uniqueStudent(tx, data.studentNumber, id);
      await tx.Alumni.updateOne({ _id: id, ...active }, { $set: data }, { runValidators: true });
      await audit(
        tx,
        context,
        "alumni.update",
        "alumni",
        id,
        `Updated Alumni ${JSON.stringify(formatDisplayName(before))} (${before.studentNumber}): ${describeAuditChanges(before, data)}`,
      );
      return detail(context, id, tx);
    });
  },
  async delete(context: Context, input: z.input<typeof alumniSchemas.delete.input>) {
    management(context, "alumni.delete");
    const { id } = alumniSchemas.delete.input.parse(input);
    return context.db.transaction(async (tx) => {
      const alumni = await activeAlumni(tx, id);
      await tx.Alumni.updateOne({ _id: id, ...active }, { $set: { deletedAt: new Date() } });
      await audit(
        tx,
        context,
        "alumni.delete",
        "alumni",
        id,
        `Archived Alumni ${JSON.stringify(formatDisplayName(alumni))} (${alumni.studentNumber})`,
      );
      return { ok: true };
    });
  },
  async addEmployment(context: Context, input: z.input<typeof alumniSchemas.addEmployment.input>) {
    management(context, "alumni.write");
    const { alumniId, ...data } = alumniSchemas.addEmployment.input.parse(input);
    return employmentService.create(context, data, alumniId);
  },
  async deleteEmployment(
    context: Context,
    input: z.input<typeof alumniSchemas.deleteEmployment.input>,
  ) {
    return employmentService.remove(context, alumniSchemas.deleteEmployment.input.parse(input).id);
  },
  async addTracking(context: Context, input: z.input<typeof alumniSchemas.addTracking.input>) {
    const user = management(context, "tracking.write");
    const data = alumniSchemas.addTracking.input.parse(input);
    return context.db.transaction(async (tx) => {
      const before = await activeAlumni(tx, data.alumniId);
      const event = toEntity(
        (await tx.TrackingEvent.create({ ...data, createdById: user.id })).toObject(),
      );
      await tx.Alumni.updateOne(
        { _id: data.alumniId, ...active },
        { $set: { isTracked: data.isTracked, lastTrackedAt: data.isTracked ? new Date() : null } },
      );
      await audit(
        tx,
        context,
        "tracking.create",
        "alumni",
        data.alumniId,
        `Recorded tracking for ${JSON.stringify(formatDisplayName(before))} (${before.studentNumber}): ${describeAuditChanges(before, { isTracked: data.isTracked })}; source ${JSON.stringify(data.source ?? "")}; notes ${JSON.stringify(data.notes ?? "")}`,
      );
      return event;
    });
  },
  linkAlumni,
};
export const meProfileService = {
  async get(context: Context) {
    const a = await linkedAlumni(context);
    return detail(context, a.id, context.db, true);
  },
  async update(context: Context, _input: z.input<typeof meProfileSchemas.update.input>) {
    requireAccess(context);
    throw new ApiError("FORBIDDEN", {
      message: "Edit personal details in Settings ? Account.",
    });
  },
};
export async function linkAlumni(
  context: Context,
  input: z.input<typeof alumniSchemas.linkAlumni.input>,
) {
  const actor = management(context, "users.write");
  requireAccess(context, "alumni.write");
  if (!isAdministrator(actor))
    throw new ApiError("FORBIDDEN", { message: "Only an administrator can link alumni profiles." });
  const { id, alumniId } = alumniSchemas.linkAlumni.input.parse(input);
  return context.db.transaction(async (tx) => {
    const user = await tx.User.findOne({ _id: id, status: "active" }).lean();
    if (!user) throw new ApiError("NOT_FOUND", { message: "Active user not found." });
    const alumni = await activeAlumni(tx, alumniId);
    if (user.alumniId && String(user.alumniId) !== alumniId)
      throw new ApiError("CONFLICT", {
        message: "This user is already linked to another profile.",
      });
    if (await tx.User.exists({ _id: { $ne: id }, alumniId }))
      throw new ApiError("CONFLICT", {
        message: "This alumni profile is already linked to another account.",
      });
    if (!user.firstName || !user.lastName)
      throw new ApiError("CONFLICT", {
        message: "Complete the user's structured name before linking this profile.",
      });
    const names = {
      firstName: user.firstName,
      middleName: user.middleName ?? "",
      lastName: user.lastName,
      suffix: user.suffix ?? "",
    };
    await tx.User.updateOne(
      { _id: id, status: "active" },
      { $set: { alumniId, name: formatDisplayName(names) } },
    );
    await tx.Alumni.updateOne({ _id: alumniId, ...active }, { $set: names });
    await audit(
      tx,
      context,
      "users.linkAlumni",
      "user",
      id,
      `Linked account ${JSON.stringify(user.name)} (${user.email}) to Alumni ${JSON.stringify(formatDisplayName(alumni))} (${alumni.studentNumber}), record ${alumniId}`,
    );
    return { ok: true };
  });
}
export const filesService = {
  async remove(context: Context, input: z.input<typeof filesSchemas.remove.input>, self = false) {
    if (self) requireAccess(context);
    else management(context, "files.delete");
    const { id } = filesSchemas.remove.input.parse(input);
    return context.db.transaction(async (tx) => {
      const file = await tx.EvidenceFile.findOne({ _id: id, ...active }).lean();
      if (!file) throw new ApiError("NOT_FOUND");
      if (self && (await linkedAlumni(context, tx)).id !== String(file.alumniId))
        throw new ApiError("FORBIDDEN", { message: "You may only remove your own files." });
      await activeAlumni(tx, String(file.alumniId));
      await tx.EvidenceFile.updateOne({ _id: id, ...active }, { $set: { deletedAt: new Date() } });
      if (file.kind === "image")
        await tx.Alumni.updateOne(
          {
            _id: file.alumniId,
            photoUrl: {
              $in: [`/api/files/${id}`, `/api/me/files/${id}`, ...(file.url ? [file.url] : [])],
            },
          },
          { $unset: { photoUrl: 1 } },
        );
      await audit(
        tx,
        context,
        "files.delete",
        "evidence",
        id,
        `Archived file ${JSON.stringify(file.originalName)} from Alumni profile ${file.alumniId}`,
      );
      return { ok: true };
    });
  },
};
