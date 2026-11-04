import { formatDisplayName } from "@Alumni-Tracking-Ss/contracts/names";
import { pdfReportSchemas } from "@Alumni-Tracking-Ss/contracts/reports";
import { alumniSchemas } from "@Alumni-Tracking-Ss/contracts/alumni";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { alumniScopeFilter } from "@Alumni-Tracking-Ss/api/scope";
import type { z } from "zod";
import { active, audit, management } from "../../academic/service";
import { alumniService } from "../../alumni/service";
import { exportAlumniRows } from "../service";
import { renderPdf } from "./render";
import { alumniList } from "./templates/alumni-list";
import { assignmentReport, type AssignmentGroup } from "./templates/assignments";
import { profileSheet } from "./templates/profile-sheet";

// PDFs are heavier than CSV rows; larger lists should be exported as CSV.
export const PDF_ROW_LIMIT = 2000;

const meta = (context: Context) => ({
  generatedBy: context.user!.name,
  generatedAt: new Date(),
});
const safeName = (value: string) => value.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80);

async function describeFilters(
  context: Context,
  p: NonNullable<z.output<typeof pdfReportSchemas.alumniList>>,
) {
  const parts: string[] = [];
  const nameOf = (row: { name?: string } | null) => row?.name;
  const college = p.collegeId
    ? nameOf(await context.db.College.findById(p.collegeId).select("name").lean())
    : undefined;
  const department = p.departmentId
    ? nameOf(await context.db.Department.findById(p.departmentId).select("name").lean())
    : undefined;
  const program = p.programId
    ? nameOf(await context.db.Program.findById(p.programId).select("name").lean())
    : undefined;
  if (college) parts.push(`College: ${college}`);
  if (department) parts.push(`Department: ${department}`);
  if (program) parts.push(`Program: ${program}`);
  if (p.graduationYear) parts.push(`Graduation year: ${p.graduationYear}`);
  if (p.batch) parts.push(`Batch: ${p.batch}`);
  if (p.tracked && p.tracked !== "all")
    parts.push(p.tracked === "tracked" ? "Tracked" : "Untracked");
  return parts.length ? parts.join(" · ") : "All alumni in your scope";
}

async function audited(context: Context, action: string, summary: string, entityId = "pdf") {
  await audit(context.db, context, action, "report", entityId, summary);
}

export const pdfReportsService = {
  async alumniList(context: Context, input?: z.input<typeof pdfReportSchemas.alumniList>) {
    management(context, "reports.export");
    const filters = pdfReportSchemas.alumniList.parse(input) ?? {};
    const rows = await exportAlumniRows(context, filters, PDF_ROW_LIMIT);
    const buffer = await renderPdf(
      alumniList(rows, { ...meta(context), filters: await describeFilters(context, filters) }),
    );
    await audited(context, "reports.pdf.alumni", `Exported alumni list PDF (${rows.length} rows)`);
    return { buffer, fileName: "alumni-list.pdf" };
  },

  async profile(context: Context, input: z.input<typeof pdfReportSchemas.profile>) {
    management(context, "reports.export");
    const { id } = pdfReportSchemas.profile.parse(input);
    // alumniService.get applies the caller's scope (out-of-scope ids are 404).
    // Parsing through the public output contract types the record and drops private fields.
    const record = alumniSchemas.get.output.parse(await alumniService.get(context, { id }));
    const buffer = await renderPdf(profileSheet(record, meta(context)));
    await audited(
      context,
      "reports.pdf.profile",
      `Exported profile PDF for ${JSON.stringify(formatDisplayName(record))} (${record.studentNumber})`,
      id,
    );
    return { buffer, fileName: `alumni-${safeName(record.studentNumber)}.pdf` };
  },

  async assignments(context: Context) {
    management(context, "reports.export");
    const scope = await alumniScopeFilter(context);
    const rows = await context.db.Alumni.find({ $and: [{ ...active }, scope] })
      .select(
        "studentNumber firstName middleName lastName suffix programId isTracked assignedFacultyId needsReassignment",
      )
      .sort({ lastName: 1, firstName: 1, _id: 1 })
      .limit(PDF_ROW_LIMIT + 1)
      .lean();
    if (rows.length > PDF_ROW_LIMIT)
      throw new ApiError("BAD_REQUEST", {
        message: `More than ${PDF_ROW_LIMIT} alumni are in scope; use the CSV export instead.`,
      });
    const programs = new Map(
      (
        await context.db.Program.find({ _id: { $in: rows.map((r) => r.programId) } })
          .select("code")
          .lean()
      ).map((p) => [String(p._id), p.code]),
    );
    const faculty = await context.db.Faculty.find({
      _id: { $in: rows.flatMap((r) => (r.assignedFacultyId ? [r.assignedFacultyId] : [])) },
    })
      .select("firstName lastName departmentId")
      .lean();
    const departments = new Map(
      (
        await context.db.Department.find({
          _id: { $in: faculty.flatMap((f) => (f.departmentId ? [f.departmentId] : [])) },
        })
          .select("name")
          .lean()
      ).map((d) => [String(d._id), d.name]),
    );
    const groups: AssignmentGroup[] = faculty
      .map((f) => ({
        faculty: `${f.firstName} ${f.lastName}`,
        department: departments.get(String(f.departmentId)) ?? "Unplaced",
        alumni: rows
          .filter((r) => String(r.assignedFacultyId) === String(f._id))
          .map((r) => ({
            studentNumber: r.studentNumber,
            name: formatDisplayName(r),
            program: programs.get(String(r.programId)) ?? "",
            isTracked: r.isTracked,
          })),
      }))
      .sort((a, b) => a.faculty.localeCompare(b.faculty));
    const buffer = await renderPdf(
      assignmentReport(
        {
          groups,
          unassigned: rows.filter((r) => !r.assignedFacultyId).length,
          needsReassignment: rows.filter((r) => r.needsReassignment).length,
        },
        meta(context),
      ),
    );
    await audited(
      context,
      "reports.pdf.assignments",
      `Exported assignment report PDF (${rows.length} alumni)`,
    );
    return { buffer, fileName: "assignment-report.pdf" };
  },
};
