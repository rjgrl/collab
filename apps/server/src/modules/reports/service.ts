import { formatDisplayName } from "@Alumni-Tracking-Ss/contracts/names";
import { toEntity, percentTracked } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { toCsv } from "@Alumni-Tracking-Ss/api/validation";
import { dashboardSchemas, reportsSchemas } from "@Alumni-Tracking-Ss/contracts/reports";
import type { z } from "zod";
import { active, management, entityProgram } from "../academic/service";
import { alumniScope, scopeFilter, scopedDepartmentIds } from "@Alumni-Tracking-Ss/api/scope";
import { alumniContacts } from "../alumni/contacts.service";
export async function activeProgramIds(context: Context, departmentId?: string) {
  const departments = await context.db.Department.find({
    ...active,
    ...(departmentId ? { _id: departmentId } : {}),
  })
    .select("_id")
    .lean();
  const programs = await context.db.Program.find({
    ...active,
    departmentId: { $in: departments.map((r) => r._id) },
  })
    .select("_id departmentId")
    .lean();
  return { departments, programs };
}
/**
 * `scoped` limits counts to the caller's alumni scope (staff dashboards and reports). The
 * Alumni-facing aggregate passes false: it shows only privacy-suppressed institution totals.
 */
export async function summarizePopulation(
  context: Context,
  input: z.input<typeof dashboardSchemas.summary.input> | undefined,
  scoped: boolean,
) {
  const p = dashboardSchemas.summary.input.parse(input);
  const { programs } = await activeProgramIds(context);
  const scope = scoped ? await alumniScope(context) : ({ kind: "all" } as const);
  const visibleDepartments = scopedDepartmentIds(scope);
  const groups = await context.db.Alumni.aggregate<{
    _id: { programId: unknown; isTracked: boolean };
    count: number;
    registered?: number;
  }>([
    {
      $match: {
        $and: [
          {
            ...active,
            programId: { $in: programs.map((p) => p._id) },
            ...(p?.tracked && p.tracked !== "all" ? { isTracked: p.tracked === "tracked" } : {}),
          },
          scopeFilter(scope),
        ],
      },
    },
    {
      $lookup: {
        from: "User",
        localField: "_id",
        foreignField: "alumniId",
        pipeline: [{ $project: { _id: 1 } }],
        as: "registeredAccount",
      },
    },
    {
      $group: {
        _id: { programId: "$programId", isTracked: "$isTracked" },
        count: { $sum: 1 },
        registered: { $sum: { $cond: [{ $gt: [{ $size: "$registeredAccount" }, 0] }, 1, 0] } },
      },
    },
  ]);
  const departments = await context.db.Department.find({
    ...active,
    ...(visibleDepartments ? { _id: { $in: visibleDepartments } } : {}),
  })
    .sort({ name: 1, _id: 1 })
    .lean();
  const byDepartment = departments.map((raw) => {
    const d = toEntity(raw);
    const ids = new Set(
      programs.filter((p) => String(p.departmentId) === d.id).map((p) => String(p._id)),
    );
    const own = groups.filter((g) => ids.has(String(g._id.programId)));
    const graduates = own.reduce((s, g) => s + g.count, 0),
      tracked = own.filter((g) => g._id.isTracked).reduce((s, g) => s + g.count, 0);
    return {
      id: d.id,
      name: d.name,
      graduates,
      tracked,
      registered: own.reduce((sum, group) => sum + (group.registered ?? 0), 0),
      percentTracked: percentTracked(graduates, tracked),
    };
  });
  const selected = byDepartment.filter((d) => !p?.departmentId || d.id === p.departmentId);
  const graduates = selected.reduce((s, d) => s + d.graduates, 0),
    tracked = selected.reduce((s, d) => s + d.tracked, 0);
  return {
    registered: selected.reduce((sum, department) => sum + department.registered, 0),
    graduates,
    tracked,
    untracked: graduates - tracked,
    percentTracked: percentTracked(graduates, tracked),
    formula: "percentTracked = round((tracked / graduates) * 100, 2)",
    conflictNote:
      "The source guide example (IT: 14750 tracked / 10000 / 5%) is internally inconsistent. The system uses tracked ÷ graduates.",
    byDepartment: selected,
  };
}
export const dashboardService = {
  async summary(context: Context, input?: z.input<typeof dashboardSchemas.summary.input>) {
    management(context, "dashboard.read");
    return summarizePopulation(context, input, true);
  },
};
/** In-scope, filtered alumni for exports. Throws past `limit` rather than truncating silently. */
export async function exportAlumniRows(
  context: Context,
  input?: z.input<typeof reportsSchemas.alumniCsv.input>,
  limit = 10000,
) {
  const p = reportsSchemas.alumniCsv.input.parse(input) ?? {};
  const departments = await context.db.Department.find({
    ...active,
    ...(p.departmentId ? { _id: p.departmentId } : {}),
    ...(p.collegeId ? { collegeId: p.collegeId } : {}),
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
  const rows = await context.db.Alumni.find({
    $and: [
      {
        ...active,
        programId: { $in: programs.map((p) => p._id) },
        ...(p.tracked && p.tracked !== "all" ? { isTracked: p.tracked === "tracked" } : {}),
        ...(p.graduationYear ? { graduationYear: p.graduationYear } : {}),
        ...(p.batch ? { batch: p.batch } : {}),
      },
      scopeFilter(await alumniScope(context)),
    ],
  })
    .sort({ lastName: 1, firstName: 1, _id: 1 })
    .limit(limit + 1)
    .lean();
  if (rows.length > limit)
    throw new ApiError("BAD_REQUEST", {
      message: `This export exceeds ${limit.toLocaleString("en-US")} rows. Narrow the filters before exporting.`,
    });
  const primary = await alumniContacts(
    context.db,
    rows.map((row) => String(row._id)),
    true,
  );
  const result = [];
  for (const raw of rows) {
    const row = toEntity(raw);
    const contact = (type: string) =>
      primary.find((c) => c.alumniId === row.id && c.type === type)?.value;
    result.push({
      ...row,
      program: await entityProgram(context.db, String(row.programId)),
      // Contacts are authoritative; legacy profile fields fill gaps for older records.
      phone: contact("phone") ?? row.mobileNumber ?? "",
      email: contact("email") ?? row.personalEmail ?? "",
      facebook: contact("facebook") ?? row.facebookAccount ?? "",
    });
  }
  return result;
}
async function scopedDepartmentOptions(context: Context) {
  const visible = scopedDepartmentIds(await alumniScope(context));
  const rows = await context.db.Department.find({
    ...active,
    ...(visible ? { _id: { $in: visible } } : {}),
  })
    .select("_id name")
    .lean();
  return rows.map((d) => ({ id: String(d._id), name: d.name }));
}
export const reportsService = {
  async summary(context: Context, input?: z.input<typeof reportsSchemas.summary.input>) {
    management(context, "reports.read");
    const result = await summarizePopulation(context, input, true);
    return {
      graduates: result.graduates,
      tracked: result.tracked,
      untracked: result.untracked,
      registered: result.registered,
      percentTracked: result.percentTracked,
      departments: await scopedDepartmentOptions(context),
    };
  },
  async alumniCsv(context: Context, input?: z.input<typeof reportsSchemas.alumniCsv.input>) {
    management(context, "reports.export");
    const rows = await exportAlumniRows(context, input);
    return {
      csv: toCsv(
        [
          "studentNumber",
          "firstName",
          "lastName",
          "middleName",
          "suffix",
          "fullName",
          "departmentName",
          "programCode",
          "gender",
          "graduationYear",
          "mobileNumber",
          "personalEmail",
          "facebookAccount",
          "isTracked",
          "employmentStatus",
        ],
        rows.map((r) => [
          r.studentNumber,
          r.firstName,
          r.lastName,
          r.middleName,
          r.suffix,
          formatDisplayName(r),
          r.program.department.name,
          r.program.code,
          r.gender,
          r.graduationYear,
          r.phone,
          r.email,
          r.facebook,
          r.isTracked,
          r.employmentStatus,
        ]),
      ),
      fileName: "alumni-report.csv",
      count: rows.length,
    };
  },
};
