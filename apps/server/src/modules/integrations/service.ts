import { formatDisplayName } from "@Alumni-Tracking-Ss/contracts/names";
import { toEntity } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import {
  listIntegrations,
  requireIntegration,
  getIntegrationStatus,
  INTEGRATION_NAMES,
} from "@Alumni-Tracking-Ss/api/integrations/registry";
import { sendEmail } from "@Alumni-Tracking-Ss/api/integrations/email";
import { readSheetRows, appendSheetRows } from "@Alumni-Tracking-Ss/api/integrations/sheets";
import { importAlumniRows } from "@Alumni-Tracking-Ss/api/services/importer";
import { csvToObjects } from "@Alumni-Tracking-Ss/api/validation";
import { integrationsSchemas } from "@Alumni-Tracking-Ss/contracts/integrations";
import type { z } from "zod";
import { requireAdministrator, requireUser } from "@Alumni-Tracking-Ss/api/access";
import { audit } from "../academic/service";
import { activeAlumni } from "../alumni/service";
import { exportAlumniRows } from "../reports/service";
import {
  integrationKey,
  storeCredentials,
  eraseCredentials,
  invalidateIntegrationEnvCache,
  readStoredCredentials,
} from "@Alumni-Tracking-Ss/api/integrations/credential-store";
import {
  credentialsError,
  INTEGRATION_CREDENTIAL_FIELDS,
} from "@Alumni-Tracking-Ss/contracts/integration-credentials";
import { testIntegrationConnection } from "@Alumni-Tracking-Ss/api/integrations/connection-test";
import { randomBytes } from "node:crypto";

async function importRows(context: Context, source: "csv" | "google_sheets", rows: unknown[]) {
  const signedIn = requireUser(context);
  if (rows.length > 10000)
    throw new ApiError("BAD_REQUEST", { message: "An import may contain at most 10,000 rows." });
  const result = await importAlumniRows(context.db, rows, { actorId: signedIn.id });
  await context.db.transaction(async (tx) => {
    const job = toEntity(
      (
        await tx.ImportJob.create({
          ...result,
          source,
          status: result.errorCount > 0 && result.successCount === 0 ? "failed" : "completed",
          createdById: signedIn.id,
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
    const key = integrationKey(context.integrationEnv);
    return listIntegrations(context.db, context.integrationEnv, { keyBuffer: key ?? undefined });
  },

  async enable(context: Context, input: z.input<typeof integrationsSchemas.enable.input>) {
    const signedIn = requireUser(context);
    requireAdministrator(context, "integrations.write");
    const p = integrationsSchemas.enable.input.parse(input);
    const key = integrationKey(context.integrationEnv);
    if (!key) {
      throw new ApiError("SERVICE_UNAVAILABLE", {
        message: "Set INTEGRATION_ENCRYPTION_KEY on the server before saving credentials.",
      });
    }

    const existing = await context.db.IntegrationSetting.findOne({ key: p.key }).lean().exec();
    if (existing?.enabled) {
      throw new ApiError("BAD_REQUEST", {
        message: "Already enabled. Update its credentials instead.",
      });
    }

    // Trim values and keep only known field names
    const trimmedValues: Record<string, string> = {};
    for (const [fieldName, value] of Object.entries(p.credentials)) {
      if (INTEGRATION_CREDENTIAL_FIELDS[p.key].some((f) => f.name === fieldName)) {
        trimmedValues[fieldName] = String(value || "").trim();
      }
    }

    // Validate credentials format
    const error = credentialsError(p.key, trimmedValues);
    if (error) throw new ApiError("BAD_REQUEST", { message: error });

    // For google_sheets with account="drive", require Drive credentials readable
    if (p.key === "google_sheets" && trimmedValues.account === "drive") {
      if (!context.integrationEnv.googleServiceAccountJson) {
        throw new ApiError("BAD_REQUEST", {
          message: "Enable Google Drive first.",
        });
      }
    }

    // Test the connection
    await testIntegrationConnection(p.key, trimmedValues, {
      env: context.integrationEnv,
      adminEmail: signedIn.email,
    });

    // Generate webhook secret for google_forms
    let webhookSecret: string | undefined;
    let valuesToStore = trimmedValues;
    if (p.key === "google_forms") {
      webhookSecret = randomBytes(32).toString("hex");
      valuesToStore = { webhookSecret };
    }

    // Store credentials in a transaction
    let status: any;
    await context.db.transaction(async (tx) => {
      const updated = await storeCredentials(tx, {
        integration: p.key,
        values: valuesToStore,
        key,
        actorId: signedIn.id as any,
        enabled: true,
      });

      const audRow = toEntity(updated);
      await audit(
        tx,
        context,
        "integrations.enable",
        "integration",
        audRow.id,
        p.key === "google_forms"
          ? `Enabled ${INTEGRATION_NAMES[p.key]}; webhook secret generated`
          : `Enabled ${INTEGRATION_NAMES[p.key]}`,
      );

      status = await getIntegrationStatus(tx, p.key, context.integrationEnv, {
        keyBuffer: key,
      });
    });

    invalidateIntegrationEnvCache();

    return {
      status,
      webhookSecret,
    };
  },

  async updateCredentials(
    context: Context,
    input: z.input<typeof integrationsSchemas.update.input>,
  ) {
    const signedIn = requireUser(context);
    requireAdministrator(context, "integrations.write");
    const p = integrationsSchemas.update.input.parse(input);
    const key = integrationKey(context.integrationEnv);
    if (!key) {
      throw new ApiError("SERVICE_UNAVAILABLE", {
        message: "Set INTEGRATION_ENCRYPTION_KEY on the server before saving credentials.",
      });
    }

    const existing = await context.db.IntegrationSetting.findOne({ key: p.key }).lean().exec();
    if (!existing?.enabled) {
      throw new ApiError("BAD_REQUEST", {
        message: "Not enabled. Enable it first.",
      });
    }

    // Get stored values
    const stored = await readStoredCredentials(existing, key);
    const storedValues = stored.status === "ok" ? stored.values : {};

    // Merge: start from stored, non-empty submitted values replace them, empty secrets keep stored
    const mergedValues: Record<string, string> = { ...storedValues };
    const fieldDefs = INTEGRATION_CREDENTIAL_FIELDS[p.key];

    for (const field of fieldDefs) {
      const submitted = p.credentials[field.name]?.trim() ?? "";
      if (field.name in p.credentials) {
        // Field was explicitly submitted
        if (submitted) {
          // Non-empty submission: use it
          mergedValues[field.name] = submitted;
        } else if (!field.secret) {
          // Empty non-secret: delete it
          delete mergedValues[field.name];
        }
        // Empty secret: keep stored value (do nothing, mergedValues already has it)
      }
    }

    // Validate credentials format
    const error = credentialsError(p.key, mergedValues);
    if (error) throw new ApiError("BAD_REQUEST", { message: error });

    // For google_sheets with account="drive", require Drive credentials readable
    if (p.key === "google_sheets" && mergedValues.account === "drive") {
      if (!context.integrationEnv.googleServiceAccountJson) {
        throw new ApiError("BAD_REQUEST", {
          message: "Enable Google Drive first.",
        });
      }
    }

    // Test the connection
    await testIntegrationConnection(p.key, mergedValues, {
      env: context.integrationEnv,
      adminEmail: signedIn.email,
    });

    // Generate new webhook secret for google_forms
    let webhookSecret: string | undefined;
    let valuesToStore = mergedValues;
    if (p.key === "google_forms") {
      webhookSecret = randomBytes(32).toString("hex");
      valuesToStore = { webhookSecret };
    }

    // Store credentials in a transaction
    let status: any;
    const summary =
      p.key === "recaptcha" || p.key === "google_auth"
        ? `Updated ${INTEGRATION_NAMES[p.key]} keys`
        : `Updated ${INTEGRATION_NAMES[p.key]} credentials`;

    await context.db.transaction(async (tx) => {
      const updated = await storeCredentials(tx, {
        integration: p.key,
        values: valuesToStore,
        key,
        actorId: signedIn.id as any,
      });

      const audRow = toEntity(updated);
      await audit(tx, context, "integrations.update", "integration", audRow.id, summary);

      status = await getIntegrationStatus(tx, p.key, context.integrationEnv, {
        keyBuffer: key,
      });
    });

    invalidateIntegrationEnvCache();

    return {
      status,
      webhookSecret,
    };
  },

  async disable(context: Context, input: z.input<typeof integrationsSchemas.disable.input>) {
    const signedIn = requireUser(context);
    requireAdministrator(context, "integrations.write");
    const p = integrationsSchemas.disable.input.parse(input);
    const key = integrationKey(context.integrationEnv);

    let status: any;
    await context.db.transaction(async (tx) => {
      const updated = await eraseCredentials(tx, p.key, signedIn.id as any);

      const audRow = toEntity(updated);
      await audit(
        tx,
        context,
        "integrations.disable",
        "integration",
        audRow.id,
        `Disabled ${INTEGRATION_NAMES[p.key]}; credentials erased`,
      );

      status = await getIntegrationStatus(tx, p.key, context.integrationEnv, {
        keyBuffer: key ?? undefined,
      });
    });

    invalidateIntegrationEnvCache();

    return { status };
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
