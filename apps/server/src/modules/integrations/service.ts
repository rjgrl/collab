import { formatDisplayName } from "@Alumni-Tracking-Ss/contracts/names";
import { toEntity } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import {
  listIntegrations,
  requireIntegration,
} from "@Alumni-Tracking-Ss/api/integrations/registry";
import { sendEmail } from "@Alumni-Tracking-Ss/api/integrations/email";
import { readSheetRows, appendSheetRows } from "@Alumni-Tracking-Ss/api/integrations/sheets";
import { importAlumniRows } from "@Alumni-Tracking-Ss/api/services/importer";
import { csvToObjects } from "@Alumni-Tracking-Ss/api/validation";
import { integrationsSchemas } from "@Alumni-Tracking-Ss/contracts/integrations";
import type { z } from "zod";
import { requireAdministrator } from "@Alumni-Tracking-Ss/api/access";
import { audit } from "../academic/service";
import { activeAlumni } from "../alumni/service";
import { exportAlumniRows } from "../reports/service";
async function importRows(context: Context, source: "csv" | "google_sheets", rows: unknown[]) {
  if (rows.length > 10000)
    throw new ApiError("BAD_REQUEST", { message: "An import may contain at most 10,000 rows." });
  const result = await importAlumniRows(context.db, rows, { actorId: context.user!.id });
  await context.db.transaction(async (tx) => {
    const job = toEntity(
      (
        await tx.ImportJob.create({
          ...result,
          source,
          status: result.errorCount > 0 && result.successCount === 0 ? "failed" : "completed",
          createdById: context.user!.id,
          completedAt: new Date(),
        })
      ).toObject(),
    );
    await audit(
      tx,
      context,
      "integrations.import",
      "importJob",
      job.id,
      `Imported ${result.successCount} of ${result.totalRows} Alumni rows from ${source}; ${result.errorCount} failed`,
    );
  });
  return result;
}
export const integrationsService = {
  async list(context: Context) {
    requireAdministrator(context, "integrations.read");
    return listIntegrations(context.db, context.integrationEnv);
  },
  async toggle(context: Context, input: z.input<typeof integrationsSchemas.toggle.input>) {
    requireAdministrator(context, "integrations.write");
    const p = integrationsSchemas.toggle.input.parse(input);
    return context.db.transaction(async (tx) => {
      const row = await tx.IntegrationSetting.findOneAndUpdate(
        { key: p.key },
        { $set: { enabled: p.enabled }, $setOnInsert: { key: p.key } },
        { upsert: true, new: true, runValidators: true },
      ).lean();
      if (!row) throw new ApiError("INTERNAL_SERVER_ERROR");
      const e = toEntity(row);
      await audit(
        tx,
        context,
        "integrations.toggle",
        "integration",
        e.id,
        `Set integration ${p.key} to ${p.enabled ? "enabled" : "disabled"}`,
      );
      return e;
    });
  },
  async sendTestEmail(
    context: Context,
    input: z.input<typeof integrationsSchemas.sendTestEmail.input>,
  ) {
    requireAdministrator(context, "integrations.write");
    const p = integrationsSchemas.sendTestEmail.input.parse(input);
    await requireIntegration(context.db, "email");
    return sendEmail(context.integrationEnv, {
      to: p.to,
      subject: "Alumni Tracking System test message",
      text: "This is a test message from the Alumni Tracking System email integration.",
    });
  },
  async notifyAlumni(
    context: Context,
    input: z.input<typeof integrationsSchemas.notifyAlumni.input>,
  ) {
    requireAdministrator(context, "integrations.write");
    const p = integrationsSchemas.notifyAlumni.input.parse(input);
    await requireIntegration(context.db, "email");
    const alumni = await activeAlumni(context.db, p.alumniId);
    if (!alumni.personalEmail)
      throw new ApiError("BAD_REQUEST", { message: "This alumni record has no personal email." });
    return sendEmail(context.integrationEnv, {
      to: alumni.personalEmail,
      subject: p.subject,
      text: p.text,
    });
  },
  async importCsv(context: Context, input: z.input<typeof integrationsSchemas.importCsv.input>) {
    requireAdministrator(context, "integrations.write");
    const p = integrationsSchemas.importCsv.input.parse(input);
    return importRows(context, "csv", csvToObjects(p.csv));
  },
  async importSheets(context: Context) {
    requireAdministrator(context, "integrations.write");
    await requireIntegration(context.db, "google_sheets");
    const rows = await readSheetRows(context.integrationEnv);
    const header = rows[0] ?? [];
    const objects = rows
      .slice(1)
      .map((row) =>
        Object.fromEntries(
          header.map((key, index) => [String(key).trim(), String(row[index] ?? "").trim()]),
        ),
      );
    return importRows(context, "google_sheets", objects);
  },
  async exportSheets(
    context: Context,
    input?: z.input<typeof integrationsSchemas.exportSheets.input>,
  ) {
    requireAdministrator(context, "reports.export");
    await requireIntegration(context.db, "google_sheets");
    const rows = await exportAlumniRows(context, input);
    await appendSheetRows(context.integrationEnv, [
      [
        "studentNumber",
        "firstName",
        "middleName",
        "lastName",
        "suffix",
        "fullName",
        "departmentName",
        "programCode",
        "isTracked",
      ],
      ...rows.map((r) => [
        r.studentNumber,
        r.firstName,
        r.middleName ?? "",
        r.lastName,
        r.suffix ?? "",
        formatDisplayName(r),
        r.program.department.name,
        r.program.code,
        String(r.isTracked),
      ]),
    ]);
    return { ok: true, count: rows.length };
  },
};
