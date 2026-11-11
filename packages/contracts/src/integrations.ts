import { z } from "zod";
import { alumniCsvInputSchema } from "./reports";
import { objectIdSchema, okSchema, dateSchema } from "./common";
import { credentialValuesSchema } from "./integration-credentials";

export const integrationKeySchema = z.enum([
  "recaptcha",
  "google_auth",
  "google_drive",
  "email",
  "image_host",
  "google_forms",
  "google_sheets",
]);
export type IntegrationKey = z.infer<typeof integrationKeySchema>;

export const integrationStatusSchema = z.object({
  key: integrationKeySchema,
  enabled: z.boolean(),
  configured: z.boolean(),
  mode: z.enum(["configured", "fallback", "disabled"]),
  summary: z.string(),
  fields: z.array(
    z.object({
      name: z.string(),
      label: z.string(),
      secret: z.boolean(),
      set: z.boolean(),
      hint: z.string().nullable(),
      value: z.string().nullable(),
    }),
  ),
  credentialStatus: z.enum(["none", "ok", "no_key", "mismatch", "unreadable"]),
  credentialsUpdatedAt: dateSchema.nullable(),
  credentialsUpdatedBy: z.string().nullable(),
});

export const enableIntegrationInputSchema = z
  .object({ key: integrationKeySchema, credentials: credentialValuesSchema })
  .strict();

export const updateIntegrationCredentialsInputSchema = z
  .object({ key: integrationKeySchema, credentials: credentialValuesSchema })
  .strict();

export const disableIntegrationInputSchema = z.object({ key: integrationKeySchema }).strict();

export const sendTestEmailInputSchema = z
  .object({ to: z.string().trim().max(254).email() })
  .strict();

export const notifyAlumniInputSchema = z
  .object({
    alumniId: objectIdSchema,
    subject: z.string().trim().min(1).max(200),
    text: z.string().trim().min(1).max(10000),
  })
  .strict();

export const importCsvInputSchema = z.object({ csv: z.string().min(1).max(5000000) }).strict();

export const importResultSchema = z.object({
  totalRows: z.number().int(),
  successCount: z.number().int(),
  errorCount: z.number().int(),
  errors: z.array(z.object({ row: z.number().int(), message: z.string() })),
});

export const emailResultSchema = z.object({ mode: z.enum(["live"]) });

export const integrationFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  secret: z.boolean(),
  set: z.boolean(),
  hint: z.string().nullable(),
  value: z.string().nullable(),
});

export const integrationsSchemas = {
  list: { input: z.void(), output: z.array(integrationStatusSchema) },
  enable: {
    input: enableIntegrationInputSchema,
    output: z.object({
      status: integrationStatusSchema,
      webhookSecret: z.string().optional(),
    }),
  },
  update: {
    input: updateIntegrationCredentialsInputSchema,
    output: z.object({
      status: integrationStatusSchema,
      webhookSecret: z.string().optional(),
    }),
  },
  disable: {
    input: disableIntegrationInputSchema,
    output: z.object({
      status: integrationStatusSchema,
    }),
  },
  sendTestEmail: { input: sendTestEmailInputSchema, output: emailResultSchema },
  notifyAlumni: { input: notifyAlumniInputSchema, output: emailResultSchema },
  importCsv: { input: importCsvInputSchema, output: importResultSchema },
  importSheets: { input: z.void(), output: importResultSchema },
  exportSheets: {
    input: alumniCsvInputSchema,
    output: okSchema.extend({ count: z.number().int() }),
  },
};
