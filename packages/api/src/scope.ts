import { isAdministrator } from "@Alumni-Tracking-Ss/contracts/names";
import { toEntity, type Database, type FacultyRoleLevel } from "@Alumni-Tracking-Ss/db";
import type { Context } from "./context";
import { requireUser } from "./access";
import { ApiError } from "./http-error";

/**
 * Which alumni a signed-in staff user may see and change. This is the single source of
 * record-level authorization; RBAC permissions only decide which actions are available.
 *
 * - Administrators, and Staff accounts without a faculty record: every alumnus.
 * - College-level faculty: alumni in any program of any department of their college.
 * - Department-level faculty: alumni in any program of their department.
 * - Faculty-level: only alumni assigned to them.
 * - Anyone else (inactive or unplaced faculty, alumni accounts): nothing.
 */
export type AlumniScope =
  | { kind: "all" }
  | {
      kind: "college" | "department" | "assigned";
      facultyId: string;
      roleLevel: FacultyRoleLevel;
      departmentId: string;
      collegeId: string;
      departmentIds: string[];
      programIds: string[];
      // Built from the stored ObjectIds: aggregation $match does not cast strings.
      filter: Record<string, unknown>;
    }
  | { kind: "none" };

const cache = new WeakMap<Context, Promise<AlumniScope>>();

export function alumniScope(context: Context): Promise<AlumniScope> {
  let scope = cache.get(context);
  if (!scope) {
    scope = resolveScope(context.db, context);
    cache.set(context, scope);
  }
  return scope;
}

async function resolveScope(db: Database, context: Context): Promise<AlumniScope> {
  const user = requireUser(context);
  if (isAdministrator(user)) return { kind: "all" };
  const faculty = await db.Faculty.findOne({ userId: user.id, deletedAt: null }).lean();
  if (!faculty) return user.roles.includes("staff") ? { kind: "all" } : { kind: "none" };
  const record = toEntity(faculty);
  if (!record.active || !record.departmentId) return { kind: "none" };
  const department = await db.Department.findById(record.departmentId).select("collegeId").lean();
  if (!department) return { kind: "none" };
  const collegeId = String(department.collegeId);
  const roleLevel = record.roleLevel ?? "faculty";
  // Archived departments and programs stay in scope so their alumni remain reachable by id.
  const departmentIds =
    roleLevel === "college"
      ? (await db.Department.find({ collegeId }).select("_id").lean()).map((d) => String(d._id))
      : [String(record.departmentId)];
  const programs = await db.Program.find({ departmentId: { $in: departmentIds } })
    .select("_id")
    .lean();
  const kind =
    roleLevel === "college" ? "college" : roleLevel === "department" ? "department" : "assigned";
  return {
    kind,
    facultyId: record.id,
    roleLevel,
    departmentId: String(record.departmentId),
    collegeId,
    departmentIds,
    programIds: programs.map((p) => String(p._id)),
    filter:
      kind === "assigned"
        ? { assignedFacultyId: faculty._id }
        : { programId: { $in: programs.map((p) => p._id) } },
  };
}

/** A Mongo filter for the Alumni collection; combine it with `$and`, never by spreading keys. */
export function scopeFilter(scope: AlumniScope): Record<string, unknown> {
  switch (scope.kind) {
    case "all":
      return {};
    case "college":
    case "department":
    case "assigned":
      return scope.filter;
    case "none":
      return { _id: { $in: [] } };
  }
}

export async function alumniScopeFilter(context: Context) {
  return scopeFilter(await alumniScope(context));
}

/** Department ids the scope covers, or null when it covers every department. */
export function scopedDepartmentIds(scope: AlumniScope): string[] | null {
  if (scope.kind === "all") return null;
  if (scope.kind === "none") return [];
  return scope.departmentIds.slice(0, scope.kind === "assigned" ? 1 : undefined);
}

/**
 * Loads an active alumnus the caller may manage. Out-of-scope ids get the same 404 as
 * missing ones so record existence is not revealed across departments.
 */
export async function scopedAlumni(context: Context, id: string, db: Database = context.db) {
  const row = await db.Alumni.findOne({
    $and: [{ _id: id, deletedAt: null }, await alumniScopeFilter(context)],
  }).lean();
  if (!row) throw new ApiError("NOT_FOUND", { message: "Alumni record not found." });
  return toEntity(row);
}

/** Moving an alumnus to another program must keep it inside the caller's departments. */
export async function assertProgramInScope(context: Context, programId: string) {
  const scope = await alumniScope(context);
  if (scope.kind === "all") return;
  if (scope.kind === "none" || !scope.programIds.includes(programId))
    throw new ApiError("FORBIDDEN", { message: "That program is outside your department scope." });
}

const RANK: Record<FacultyRoleLevel | "admin", number> = {
  faculty: 0,
  department: 1,
  college: 2,
  admin: 3,
};

/**
 * Who may manage faculty records and roles: Administrators everywhere, and college- or
 * department-level heads inside their scope. Staff and faculty-level users manage nobody.
 */
export type ManagerScope =
  | { level: "admin" }
  | { level: "college" | "department"; departmentIds: string[]; facultyId: string };

export async function managerScope(context: Context): Promise<ManagerScope | null> {
  if (isAdministrator(requireUser(context))) return { level: "admin" };
  const scope = await alumniScope(context);
  if (scope.kind === "college" || scope.kind === "department")
    return { level: scope.kind, departmentIds: scope.departmentIds, facultyId: scope.facultyId };
  return null;
}

export async function requireManager(context: Context) {
  const manager = await managerScope(context);
  if (!manager)
    throw new ApiError("FORBIDDEN", {
      message: "Only administrators and college or department heads can manage faculty.",
    });
  return manager;
}

/** A manager may grant or edit only levels strictly below their own, inside their departments. */
export function canGrantLevel(manager: ManagerScope, level: FacultyRoleLevel) {
  return RANK[level] < RANK[manager.level];
}
export function managesDepartment(manager: ManagerScope, departmentId: string | null | undefined) {
  return (
    manager.level === "admin" ||
    Boolean(departmentId && manager.departmentIds.includes(departmentId))
  );
}

/**
 * Assignment is an alumni operation: Administrators, unscoped Staff and heads may assign.
 * Returns the departments whose faculty may be chosen (null = any).
 */
export async function assignmentScope(context: Context): Promise<string[] | null> {
  const scope = await alumniScope(context);
  if (scope.kind === "all") return null;
  if (scope.kind === "college" || scope.kind === "department") return scope.departmentIds;
  throw new ApiError("FORBIDDEN", {
    message: "Only administrators, staff, and college or department heads can assign faculty.",
  });
}
