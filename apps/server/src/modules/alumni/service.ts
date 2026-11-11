import { activeAlumni, linkedAlumni } from "./access";
export { activeAlumni } from "./access";
import { employmentService } from "./employment.service";
import { toEntity } from "@Alumni-Tracking-Ss/db";
import type { Database, UserRecord } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { requireAccess, requireUser } from "@Alumni-Tracking-Ss/api/access";
import { accountAccessPending } from "@Alumni-Tracking-Ss/api/services/verification";
import { requiresMfa } from "@Alumni-Tracking-Ss/api/services/mfa-policy";
import { isAlumniAccount, formatDisplayName } from "@Alumni-Tracking-Ss/contracts/names";
import {
  alumniSchemas,
  meProfileSchemas,
  filesSchemas,
} from "@Alumni-Tracking-Ss/contracts/alumni";
import { objectIdSchema } from "@Alumni-Tracking-Ss/contracts/common";
import { describeAuditChanges, fieldChanges } from "@Alumni-Tracking-Ss/api/audit";
import { updateAccountNames } from "@Alumni-Tracking-Ss/api/services/account-names";
import {
  alumniScope,
  alumniScopeFilter,
  assertProgramInScope,
  assignmentScope,
  scopedAlumni,
} from "@Alumni-Tracking-Ss/api/scope";
import { assignSchemas } from "@Alumni-Tracking-Ss/contracts/faculty";
import { auditActorSchema } from "@Alumni-Tracking-Ss/contracts/audit";
import { isAdministrator } from "@Alumni-Tracking-Ss/contracts/names";
import { alumniContacts } from "./contacts.service";
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
  const alumniId = objectIdSchema.parse(String(evidence.alumniId));
  if (isAlumniAccount(user)) await activeAlumni(context.db, alumniId);
  else await scopedAlumni(context, alumniId);
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
    assignedFaculty: await assignedFacultyName(db, a.assignedFacultyId),
    contacts: await alumniContacts(db, [a.id]),
    isRegistered: Boolean(await db.User.findOne({ alumniId: a.id }).select("_id").lean()),
    program,
    employments: employments.map(toEntity),
    trackingEvents: events.map(toEntity),
    evidenceFiles: files.map(toEntity),
  };
}
async function assignedFacultyName(db: Database, id: unknown) {
  if (!id) return null;
  const faculty = await db.Faculty.findById(id).select("firstName lastName").lean();
  return faculty
    ? { id: String(faculty._id), name: `${faculty.firstName} ${faculty.lastName}` }
    : null;
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
    // Unlinked accounts have no program yet, so only administrators can see them.
    if ((await alumniScope(context)).kind !== "all") return [];
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
          "roles.key": { $in: ["viewer", "alumni"], $nin: ["faculty", "admin", "super_admin"] },
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
      ...(p.assignment === "mine"
        ? context.user!.faculty
          ? { assignedFacultyId: context.user!.faculty.id }
          : { _id: { $in: [] } }
        : p.assignment === "unassigned"
          ? { assignedFacultyId: null }
          : p.assignment === "needs_reassignment"
            ? { needsReassignment: true }
            : {}),
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
    const rows = await context.db.Alumni.find({ $and: [q, await alumniScopeFilter(context)] })
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
    const primary = await alumniContacts(
      context.db,
      rows.map((row) => String(row._id)),
      true,
    );
    return Promise.all(
      rows.map(async (row) => {
        const a = toEntity(row);
        return {
          ...a,
          assignedFaculty: await assignedFacultyName(context.db, a.assignedFacultyId),
          contacts: primary.filter((c) => c.alumniId === a.id),
          isRegistered: registered.has(a.id),
          program: await entityProgram(context.db, String(a.programId)),
        };
      }),
    );
  },
  async get(context: Context, input: z.input<typeof alumniSchemas.get.input>) {
    management(context, "alumni.read");
    const { id } = alumniSchemas.get.input.parse(input);
    await scopedAlumni(context, id);
    return detail(context, id);
  },
  async create(context: Context, _input: z.input<typeof alumniSchemas.create.input>) {
    management(context, "alumni.write");
    throw new ApiError("FORBIDDEN", {
      message: "Manual Alumni creation is unavailable. Alumni must self-register.",
    });
  },
  async update(context: Context, input: z.input<typeof alumniSchemas.update.input>) {
    management(context, "alumni.write");
    const { id, firstName, middleName, lastName, suffix, ...data } =
      alumniSchemas.update.input.parse(input);
    const names = Object.fromEntries(
      Object.entries({ firstName, middleName, lastName, suffix }).filter(
        ([, v]) => v !== undefined,
      ),
    );
    return context.db.transaction(async (tx) => {
      const before = await scopedAlumni(context, id, tx);
      await activeProgram(tx, data.programId);
      await assertProgramInScope(context, data.programId);
      await uniqueStudent(tx, data.studentNumber, id);
      const owner = await tx.User.findOne({ alumniId: id }).select("_id").lean();
      // A registered alumnus's name lives on their account; updateAccountNames keeps both in sync.
      if (Object.keys(names).length && owner)
        await updateAccountNames(tx, String(owner._id), names);
      await tx.Alumni.updateOne(
        { _id: id, ...active },
        { $set: { ...data, ...(owner ? {} : names) } },
        { runValidators: true },
      );
      const after = { ...data, ...names };
      await audit(
        tx,
        context,
        "alumni.update",
        "alumni",
        id,
        `Updated Alumni ${JSON.stringify(formatDisplayName(before))} (${before.studentNumber}): ${describeAuditChanges(before, after)}`,
        { alumniId: id, changes: fieldChanges(before, after) },
      );
      return detail(context, id, tx);
    });
  },
  async delete(context: Context, input: z.input<typeof alumniSchemas.delete.input>) {
    management(context, "alumni.delete");
    const { id } = alumniSchemas.delete.input.parse(input);
    return context.db.transaction(async (tx) => {
      const alumni = await scopedAlumni(context, id, tx);
      await tx.Alumni.updateOne({ _id: id, ...active }, { $set: { deletedAt: new Date() } });
      await audit(
        tx,
        context,
        "alumni.delete",
        "alumni",
        id,
        `Archived Alumni ${JSON.stringify(formatDisplayName(alumni))} (${alumni.studentNumber})`,
        { alumniId: id },
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
      const before = await scopedAlumni(context, data.alumniId, tx);
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
        { alumniId: data.alumniId, changes: fieldChanges(before, { isTracked: data.isTracked }) },
      );
      return event;
    });
  },
  async assign(context: Context, input: z.input<typeof assignSchemas.assign.input>) {
    management(context, "alumni.write");
    const { alumniIds, facultyId } = assignSchemas.assign.input.parse(input);
    const departments = await assignmentScope(context);
    return context.db.transaction(async (tx) => {
      const faculty = facultyId
        ? await tx.Faculty.findOne({ _id: facultyId, deletedAt: null, active: true }).lean()
        : null;
      if (
        facultyId &&
        (!faculty?.departmentId ||
          !faculty.userId ||
          (departments && !departments.includes(String(faculty.departmentId))))
      )
        throw new ApiError("NOT_FOUND", {
          message: "Active faculty member not found in your scope.",
        });
      const rows = await tx.Alumni.find({
        $and: [{ _id: { $in: alumniIds }, deletedAt: null }, await alumniScopeFilter(context)],
      })
        .select("_id firstName lastName middleName suffix studentNumber assignedFacultyId")
        .lean();
      // All or nothing: one out-of-scope id rejects the batch without revealing which.
      if (rows.length !== alumniIds.length)
        throw new ApiError("NOT_FOUND", { message: "One or more alumni records were not found." });
      const target = faculty ? `${faculty.firstName} ${faculty.lastName}` : "nobody";
      let updated = 0;
      for (const row of rows) {
        const previous = row.assignedFacultyId ? String(row.assignedFacultyId) : null;
        if (previous === facultyId) continue;
        await tx.Alumni.updateOne(
          { _id: row._id },
          { $set: { assignedFacultyId: facultyId, needsReassignment: false } },
        );
        updated++;
        await audit(
          tx,
          context,
          facultyId ? (previous ? "alumni.reassign" : "alumni.assign") : "alumni.unassign",
          "alumni",
          String(row._id),
          `Assigned ${JSON.stringify(formatDisplayName(row))} (${row.studentNumber}) to ${JSON.stringify(target)}: ${describeAuditChanges({ assignedFacultyId: previous }, { assignedFacultyId: facultyId })}`,
          {
            alumniId: String(row._id),
            changes: fieldChanges(
              { assignedFacultyId: previous },
              { assignedFacultyId: facultyId },
            ),
          },
        );
      }
      return { updated };
    });
  },
  /** Field-level change history; Administrators and college/department heads within scope. */
  async history(context: Context, input: z.input<typeof alumniSchemas.history.input>) {
    const user = management(context, "alumni.read");
    const { id } = alumniSchemas.history.input.parse(input);
    const scope = await alumniScope(context);
    if (!isAdministrator(user) && scope.kind !== "college" && scope.kind !== "department")
      throw new ApiError("FORBIDDEN", {
        message: "Change history is available to administrators and heads.",
      });
    await scopedAlumni(context, id);
    const rows = await context.db.AuditLog.find({
      $or: [{ entity: "alumni", entityId: id }, { "metadata.alumniId": id }],
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(200)
      .lean();
    return rows.map((raw) => {
      const row = toEntity(raw);
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      const actor = auditActorSchema.safeParse(metadata.actorSnapshot);
      return {
        id: row.id,
        action: row.action,
        entity: row.entity,
        summary: row.summary,
        createdAt: row.createdAt,
        actor: actor.success ? actor.data : null,
        changes: Array.isArray(metadata.changes) ? metadata.changes : [],
      };
    });
  },
  linkAlumni,
};
export const meProfileService = {
  async get(context: Context) {
    // An unlinked Alumni account is marked as needing profile completion only because the link is
    // missing. Report that specific 409, but keep every other access gate (verification, password,
    // MFA) exactly as strict as requireAccess.
    const user = requireUser(context);
    const owner = await context.db.User.findOne({ _id: user.id, status: "active" }).lean();
    if (
      owner &&
      !owner.alumniId &&
      !accountAccessPending(toEntity(owner)) &&
      !(requiresMfa(user) && !user.mfaVerified)
    )
      throw new ApiError("CONFLICT", {
        message: "Your account must be linked to an alumni profile by an administrator.",
      });
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
  _input: z.input<typeof alumniSchemas.linkAlumni.input>,
) {
  management(context, "users.write");
  requireAccess(context, "alumni.write");
  throw new ApiError("FORBIDDEN", {
    message: "Manual Alumni linking is unavailable. Alumni must complete their own registration.",
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
      if (self) await activeAlumni(tx, String(file.alumniId));
      else await scopedAlumni(context, String(file.alumniId), tx);
      await tx.EvidenceFile.updateOne({ _id: id, ...active }, { $set: { deletedAt: new Date() } });
      if (file.kind === "image") {
        const imageUrls = [
          `/api/files/${id}`,
          `/api/me/files/${id}`,
          ...(file.url ? [file.url] : []),
        ];
        await tx.User.updateOne(
          { alumniId: file.alumniId, image: { $in: imageUrls } },
          { $set: { image: null } },
        );
        await tx.Alumni.updateOne(
          {
            _id: file.alumniId,
            photoUrl: {
              $in: imageUrls,
            },
          },
          { $set: { photoUrl: null } },
        );
      }
      await audit(
        tx,
        context,
        "files.delete",
        "evidence",
        id,
        `Archived file ${JSON.stringify(file.originalName)} from Alumni profile ${file.alumniId}`,
        { alumniId: String(file.alumniId) },
      );
      return { ok: true };
    });
  },
};
