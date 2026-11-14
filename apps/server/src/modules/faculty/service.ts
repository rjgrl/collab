import { ROLE } from "@Alumni-Tracking-Ss/contracts/names";
import { facultySchemas, FACULTY_LEVEL_LABELS } from "@Alumni-Tracking-Ss/contracts/faculty";
import { hashPassword, toEntity, type Database, type FacultyRecord } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { requireAccess, rejectAlumniManagement } from "@Alumni-Tracking-Ss/api/access";
import { describeAuditChanges } from "@Alumni-Tracking-Ss/api/audit";
import { authorizationTransaction } from "@Alumni-Tracking-Ss/api/services/authorization";
import { assertPasswordSafe } from "@Alumni-Tracking-Ss/api/services/password-security";
import { assertStaffEmailAllowed } from "@Alumni-Tracking-Ss/api/services/staff-domain";
import {
  alumniScope,
  canGrantLevel,
  managesDepartment,
  requireManager,
  type ManagerScope,
} from "@Alumni-Tracking-Ss/api/scope";
import type { z } from "zod";
import { active, activeDepartment, audit, escapeRegex } from "../academic/service";

type Input<K extends keyof typeof facultySchemas> = z.input<(typeof facultySchemas)[K]["input"]>;

async function present(db: Database, row: FacultyRecord) {
  const f = toEntity(row);
  const department = f.departmentId
    ? await db.Department.findById(f.departmentId).select("_id name collegeId").lean()
    : null;
  return {
    id: f.id,
    userId: f.userId ? String(f.userId) : null,
    firstName: f.firstName,
    lastName: f.lastName,
    email: f.email ?? null,
    employeeNumber: f.employeeNumber,
    departmentId: f.departmentId ? String(f.departmentId) : null,
    department: department
      ? {
          id: String(department._id),
          name: department.name,
          collegeId: String(department.collegeId),
        }
      : null,
    roleLevel: f.roleLevel ?? "faculty",
    active: f.active ?? false,
    assignedCount: await db.Alumni.countDocuments({ assignedFacultyId: f.id, deletedAt: null }),
  };
}

function assertCanManage(
  manager: ManagerScope,
  target: { departmentId?: unknown; roleLevel?: string },
) {
  const level = (target.roleLevel ?? "faculty") as "faculty" | "department" | "college";
  if (
    !managesDepartment(manager, target.departmentId ? String(target.departmentId) : null) ||
    !canGrantLevel(manager, level)
  )
    // Same answer as a missing record: heads cannot probe faculty outside their scope.
    throw new ApiError("NOT_FOUND", { message: "Faculty record not found." });
}

function assertGrant(
  manager: ManagerScope,
  level: "faculty" | "department" | "college",
  departmentId: string,
) {
  if (!canGrantLevel(manager, level))
    throw new ApiError("FORBIDDEN", {
      message: `You cannot grant the ${FACULTY_LEVEL_LABELS[level]} level.`,
    });
  if (!managesDepartment(manager, departmentId))
    throw new ApiError("FORBIDDEN", { message: "That department is outside your scope." });
}

/** Unassigns alumni the faculty member can no longer track and flags them for reassignment. */
async function releaseAssignments(tx: Database, facultyId: string, keepProgramIds?: string[]) {
  const result = await tx.Alumni.updateMany(
    {
      assignedFacultyId: facultyId,
      ...(keepProgramIds ? { programId: { $nin: keepProgramIds } } : {}),
    },
    { $set: { assignedFacultyId: null, needsReassignment: true } },
  );
  return result.modifiedCount;
}

export const facultyService = {
  async list(context: Context, input?: Input<"list">) {
    requireAccess(context);
    rejectAlumniManagement(context);
    const scope = await alumniScope(context);
    if (scope.kind === "assigned" || scope.kind === "none")
      throw new ApiError("FORBIDDEN", {
        message: "Faculty lists are available to heads and administrators.",
      });
    const p = facultySchemas.list.input.parse(input) ?? { page: 1, pageSize: 20 };
    const departments = scope.kind === "all" ? null : scope.departmentIds;
    if (p.departmentId && departments && !departments.includes(p.departmentId)) return [];
    const filter = {
      ...active,
      ...(p.departmentId
        ? { departmentId: p.departmentId }
        : departments
          ? { departmentId: { $in: departments } }
          : {}),
      ...(p.active ? { active: p.active === "true" } : {}),
      ...(p.search
        ? {
            $or: ["firstName", "lastName", "email", "employeeNumber"].map((key) => ({
              [key]: { $regex: escapeRegex(p.search!), $options: "i" },
            })),
          }
        : {}),
    };
    const rows = await context.db.Faculty.find(filter)
      .sort({ lastName: 1, firstName: 1, _id: 1 })
      .skip((p.page - 1) * p.pageSize)
      .limit(p.pageSize)
      .lean();
    const result = [];
    for (const row of rows) result.push(await present(context.db, row));
    return result;
  },

  async create(context: Context, input: Input<"create">) {
    requireAccess(context);
    rejectAlumniManagement(context);
    const manager = await requireManager(context);
    const data = facultySchemas.create.input.parse(input);
    assertGrant(manager, data.roleLevel, data.departmentId);
    assertStaffEmailAllowed(data.email, [ROLE.faculty]);
    if (data.password) await assertPasswordSafe(data.password);
    const passwordHash = data.password ? await hashPassword(data.password) : null;
    return authorizationTransaction(context.db, async (tx) => {
      const department = await activeDepartment(tx, data.departmentId);
      if (await tx.User.exists({ email: data.email }))
        throw new ApiError("CONFLICT", { message: "Email is already in use." });
      if (await tx.Faculty.exists({ employeeNumber: data.employeeNumber }))
        throw new ApiError("CONFLICT", { message: "Employee number is already in use." });
      const role = await tx.Role.findOne({ key: ROLE.faculty }).lean();
      if (!role) throw new ApiError("INTERNAL_SERVER_ERROR", { message: "Roles are not seeded." });
      const user = await tx.User.create({
        name: `${data.firstName} ${data.lastName}`,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        passwordHash,
        status: "active",
        verificationRequired: true,
        needsProfileCompletion: true,
      });
      await tx.UserRole.create({ userId: user._id, roleId: role._id });
      const faculty = await tx.Faculty.create({
        userId: user._id,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        employeeNumber: data.employeeNumber,
        departmentId: data.departmentId,
        roleLevel: data.roleLevel,
        active: true,
      });
      await audit(
        tx,
        context,
        "faculty.create",
        "faculty",
        String(faculty._id),
        `Created ${FACULTY_LEVEL_LABELS[data.roleLevel]} ${JSON.stringify(`${data.firstName} ${data.lastName}`)} (${data.email}) in ${JSON.stringify(department.name)}`,
      );
      return present(tx, faculty.toObject());
    });
  },

  async update(context: Context, input: Input<"update">) {
    requireAccess(context);
    rejectAlumniManagement(context);
    const manager = await requireManager(context);
    const { id, ...changes } = facultySchemas.update.input.parse(input);
    return authorizationTransaction(context.db, async (tx) => {
      const before = await tx.Faculty.findOne({ _id: id, ...active }).lean();
      if (!before) throw new ApiError("NOT_FOUND", { message: "Faculty record not found." });
      assertCanManage(manager, before);
      const departmentId =
        changes.departmentId ?? (before.departmentId ? String(before.departmentId) : null);
      const roleLevel = changes.roleLevel ?? before.roleLevel ?? "faculty";
      if (!departmentId)
        throw new ApiError("BAD_REQUEST", {
          message: "Choose a department for this faculty member.",
        });
      assertGrant(manager, roleLevel, departmentId);
      if (changes.departmentId) await activeDepartment(tx, changes.departmentId);
      if (
        changes.employeeNumber &&
        (await tx.Faculty.exists({ employeeNumber: changes.employeeNumber, _id: { $ne: id } }))
      )
        throw new ApiError("CONFLICT", { message: "Employee number is already in use." });
      if ((changes.active ?? before.active) && !before.userId)
        throw new ApiError("BAD_REQUEST", {
          message: "This legacy record has no sign-in account; it cannot be activated.",
        });
      const row = await tx.Faculty.findOneAndUpdate(
        { _id: id, ...active },
        { $set: { ...changes, departmentId, roleLevel } },
        { returnDocument: "after", runValidators: true },
      ).lean();
      if (!row) throw new ApiError("NOT_FOUND", { message: "Faculty record not found." });
      if (before.userId && (changes.firstName || changes.lastName))
        await tx.User.updateOne(
          { _id: before.userId },
          {
            $set: {
              firstName: row.firstName,
              lastName: row.lastName,
              name: `${row.firstName} ${row.lastName}`,
            },
          },
        );
      let released = 0;
      if (row.active === false) released = await releaseAssignments(tx, id);
      else if (changes.departmentId && changes.departmentId !== String(before.departmentId)) {
        const programs = await tx.Program.find({ departmentId: changes.departmentId })
          .select("_id")
          .lean();
        released = await releaseAssignments(
          tx,
          id,
          programs.map((p) => String(p._id)),
        );
      }
      // Role changes force a fresh session so scope and menus refresh everywhere.
      if (
        before.userId &&
        (roleLevel !== before.roleLevel ||
          row.active !== before.active ||
          departmentId !== String(before.departmentId))
      )
        await tx.Session.deleteMany({ userId: before.userId });
      await audit(
        tx,
        context,
        roleLevel !== before.roleLevel
          ? "faculty.role"
          : row.active === false && before.active
            ? "faculty.deactivate"
            : "faculty.update",
        "faculty",
        id,
        `Updated faculty ${JSON.stringify(`${before.firstName} ${before.lastName}`)}: ${describeAuditChanges(
          { ...before, departmentId: before.departmentId ? String(before.departmentId) : null },
          { ...changes, departmentId, roleLevel },
        )}${released ? `; ${released} assigned alumni flagged for reassignment` : ""}`,
      );
      return present(tx, row);
    });
  },
};
