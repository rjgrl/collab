import { formatDisplayName } from "@Alumni-Tracking-Ss/contracts/names";
import { toEntity, percentTracked } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { toCsv } from "@Alumni-Tracking-Ss/api/validation";
import { dashboardSchemas, reportsSchemas } from "@Alumni-Tracking-Ss/contracts/reports";
import type { z } from "zod";
import { active, management, entityProgram } from "../academic/service";
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
export async function summarizePopulation(
  context: Context,
  input?: z.input<typeof dashboardSchemas.summary.input>,
) {
  const p = dashboardSchemas.summary.input.parse(input);
  const { programs } = await activeProgramIds(context);
  const groups = await context.db.Alumni.aggregate<{
    _id: { programId: unknown; isTracked: boolean };
    count: number;
    registered?: number;
  }>([
    {
      $match: {
        ...active,
        programId: { $in: programs.map((p) => p._id) },
        ...(p?.tracked && p.tracked !== "all" ? { isTracked: p.tracked === "tracked" } : {}),
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
  const departments = await context.db.Department.find(active).sort({ name: 1, _id: 1 }).lean();
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
    return summarizePopulation(context, input);
  },
};
export async function exportAlumniRows(
  context: Context,
  input?: z.input<typeof reportsSchemas.alumniCsv.input>,
) {
  const p = reportsSchemas.alumniCsv.input.parse(input);
  const { programs } = await activeProgramIds(context, p?.departmentId);
  const rows = await context.db.Alumni.find({
    ...active,
    programId: { $in: programs.map((p) => p._id) },
    ...(p?.tracked && p.tracked !== "all" ? { isTracked: p.tracked === "tracked" } : {}),
  })
    .sort({ lastName: 1, firstName: 1, _id: 1 })
    .limit(10001)
    .lean();
  if (rows.length > 10000)
    throw new ApiError("BAD_REQUEST", {
      message:
        "This export exceeds 10,000 rows. Narrow the department or tracking filters before exporting.",
    });
  return Promise.all(
    rows.map(async (raw) => {
      const row = toEntity(raw);
      return { ...row, program: await entityProgram(context.db, String(row.programId)) };
    }),
  );
}
export const reportsService = {
  async summary(context: Context, input?: z.input<typeof reportsSchemas.summary.input>) {
    management(context, "reports.read");
    const result = await summarizePopulation(context, input);
    return {
      graduates: result.graduates,
      tracked: result.tracked,
      untracked: result.untracked,
      registered: result.registered,
      percentTracked: result.percentTracked,
      departments: (await context.db.Department.find(active).select("_id name").lean()).map(
        (d) => ({ id: String(d._id), name: d.name }),
      ),
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
          r.mobileNumber,
          r.personalEmail,
          r.facebookAccount,
          r.isTracked,
          r.employmentStatus,
        ]),
      ),
      fileName: "alumni-report.csv",
      count: rows.length,
    };
  },
};
