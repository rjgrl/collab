import { percentTracked, withNotDeleted } from "@Alumni-Tracking-Ss/db";
import { z } from "zod";

import { requirePermission } from "../index";
import { toCsv } from "../validation";
import { listIntegrations } from "../integrations/registry";
import { sendEmail } from "../integrations/email";
import { appendSheetRows, readSheetRows } from "../integrations/sheets";
import { csvToObjects } from "../validation";
import { importAlumniRows } from "../services/importer";
import { writeAudit } from "../audit";
import { ORPCError } from "@orpc/server";

function departmentFilter(departmentId?: string) {
  return withNotDeleted({
    program: withNotDeleted(departmentId ? { departmentId } : undefined),
  });
}

export const dashboardRouter = {
  summary: requirePermission("dashboard.read")
    .input(z.object({ departmentId: z.string().optional() }).optional())
    .handler(async ({ context, input }) => {
      const where = departmentFilter(input?.departmentId);
      const [graduates, tracked, departments] = await Promise.all([
        context.db.alumni.count({ where }),
        context.db.alumni.count({ where: { AND: [where, { isTracked: true }] } }),
        context.db.department.findMany({
          where: withNotDeleted(),
          include: {
            programs: {
              where: withNotDeleted(),
              select: { id: true },
            },
          },
          orderBy: { name: "asc" },
        }),
      ]);

      const byDepartment = await Promise.all(
        departments.map(async (department) => {
          const deptWhere = departmentFilter(department.id);
          const [deptGraduates, deptTracked] = await Promise.all([
            context.db.alumni.count({ where: deptWhere }),
            context.db.alumni.count({ where: { AND: [deptWhere, { isTracked: true }] } }),
          ]);
          return {
            id: department.id,
            code: department.code,
            name: department.name,
            graduates: deptGraduates,
            tracked: deptTracked,
            percentTracked: percentTracked(deptGraduates, deptTracked),
          };
        }),
      );

      return {
        graduates,
        tracked,
        untracked: graduates - tracked,
        percentTracked: percentTracked(graduates, tracked),
        formula: "percentTracked = round((tracked / graduates) * 100, 2)",
        conflictNote:
          "The source guide example (IT: 14750 tracked / 10000 / 5%) is internally inconsistent. The system uses tracked ÷ graduates.",
        byDepartment,
      };
    }),
};

export const reportsRouter = {
  alumniCsv: requirePermission("reports.export")
    .input(
      z
        .object({
          departmentId: z.string().optional(),
          tracked: z.enum(["all", "tracked", "untracked"]).optional(),
        })
        .optional(),
    )
    .handler(async ({ context, input }) => {
      const trackedFilter =
        input?.tracked === "tracked" ? true : input?.tracked === "untracked" ? false : undefined;
      const rows = await context.db.alumni.findMany({
        where: {
          AND: [departmentFilter(input?.departmentId), { isTracked: trackedFilter }],
        },
        include: { program: { include: { department: true } } },
        orderBy: { lastName: "asc" },
      });

      const csv = toCsv(
        [
          "studentNumber",
          "firstName",
          "lastName",
          "departmentCode",
          "programCode",
          "graduationYear",
          "mobileNumber",
          "personalEmail",
          "facebookAccount",
          "isTracked",
          "employmentStatus",
        ],
        rows.map((row) => [
          row.studentNumber,
          row.firstName,
          row.lastName,
          row.program.department.code,
          row.program.code,
          row.graduationYear,
          row.mobileNumber,
          row.personalEmail,
          row.facebookAccount,
          row.isTracked,
          row.employmentStatus,
        ]),
      );

      return { csv, fileName: "alumni-report.csv", count: rows.length };
    }),
};

export const integrationsRouter = {
  list: requirePermission("integrations.read").handler(async ({ context }) => {
    return listIntegrations(context.db, context.integrationEnv);
  }),

  toggle: requirePermission("integrations.write")
    .input(z.object({ key: z.string(), enabled: z.boolean() }))
    .handler(async ({ context, input }) => {
      const row = await context.db.integrationSetting.upsert({
        where: { key: input.key },
        update: { enabled: input.enabled },
        create: { key: input.key, enabled: input.enabled },
      });
      await writeAudit(context.db, {
        actorId: context.user.id,
        action: "integrations.toggle",
        entity: "integration",
        entityId: row.id,
        summary: `${input.enabled ? "Enabled" : "Disabled"} ${input.key}`,
        ipAddress: context.ipAddress,
      });
      return row;
    }),

  sendTestEmail: requirePermission("integrations.write")
    .input(z.object({ to: z.string().email() }))
    .handler(async ({ context, input }) => {
      return sendEmail(context.integrationEnv, {
        to: input.to,
        subject: "Alumni Tracking System test message",
        text: "This is a test message from the Alumni Tracking System email integration.",
      });
    }),

  notifyAlumni: requirePermission("integrations.write")
    .input(z.object({ alumniId: z.string(), subject: z.string(), text: z.string() }))
    .handler(async ({ context, input }) => {
      const alumni = await context.db.alumni.findUnique({ where: { id: input.alumniId } });
      if (!alumni?.personalEmail) {
        throw new ORPCError("BAD_REQUEST", { message: "This alumni record has no personal email." });
      }
      return sendEmail(context.integrationEnv, {
        to: alumni.personalEmail,
        subject: input.subject,
        text: input.text,
      });
    }),

  importCsv: requirePermission("integrations.write")
    .input(z.object({ csv: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const objects = csvToObjects(input.csv);
      const result = await importAlumniRows(context.db, objects);
      await context.db.importJob.create({
        data: {
          source: "csv",
          status: result.errorCount > 0 && result.successCount === 0 ? "failed" : "completed",
          totalRows: result.totalRows,
          successCount: result.successCount,
          errorCount: result.errorCount,
          errors: result.errors,
          createdById: context.user.id,
          completedAt: new Date(),
        },
      });
      return result;
    }),

  importSheets: requirePermission("integrations.write").handler(async ({ context }) => {
    const values = await readSheetRows(context.integrationEnv);
    const header = values[0] ?? [];
    const objects = values.slice(1).map((row) => {
      const record: Record<string, string> = {};
      header.forEach((key, index) => {
        record[String(key).trim()] = String(row[index] ?? "").trim();
      });
      return record;
    });
    const result = await importAlumniRows(context.db, objects);
    await context.db.importJob.create({
      data: {
        source: "google_sheets",
        status: result.errorCount > 0 && result.successCount === 0 ? "failed" : "completed",
        totalRows: result.totalRows,
        successCount: result.successCount,
        errorCount: result.errorCount,
        errors: result.errors,
        createdById: context.user.id,
        completedAt: new Date(),
      },
    });
    return result;
  }),

  exportSheets: requirePermission("reports.export").handler(async ({ context }) => {
    const rows = await context.db.alumni.findMany({
      where: withNotDeleted(),
      include: { program: { include: { department: true } } },
    });
    await appendSheetRows(context.integrationEnv, [
      [
        "studentNumber",
        "firstName",
        "lastName",
        "departmentCode",
        "programCode",
        "isTracked",
      ],
      ...rows.map((row) => [
        row.studentNumber,
        row.firstName,
        row.lastName,
        row.program.department.code,
        row.program.code,
        String(row.isTracked),
      ]),
    ]);
    return { ok: true, count: rows.length };
  }),
};

export const auditRouter = {
  list: requirePermission("audit.read")
    .input(z.object({ search: z.string().optional() }).optional())
    .handler(async ({ context, input }) => {
      const search = input?.search?.trim();
      return context.db.auditLog.findMany({
        where: search
          ? {
              OR: [
                { action: { contains: search, mode: "insensitive" } },
                { entity: { contains: search, mode: "insensitive" } },
                { summary: { contains: search, mode: "insensitive" } },
              ],
            }
          : undefined,
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
    }),
};

export const filesRouter = {
  remove: requirePermission("files.delete")
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await context.db.evidenceFile.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });
      return { ok: true };
    }),
};
