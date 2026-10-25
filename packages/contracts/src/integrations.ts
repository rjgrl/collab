import { z } from "zod";
import { alumniCsvInputSchema } from "./reports";
import { objectIdSchema, okSchema } from "./common";
export const integrationKeySchema = z.enum([
  "recaptcha",
  "google_auth",
  "google_drive",
  "email",
  "image_host",
  "google_forms",
  "google_sheets",
]);
export const integrationStatusSchema = z.object({
  key: integrationKeySchema,
  enabled: z.boolean(),
  configured: z.boolean(),
  mode: z.enum(["configured", "fallback", "disabled"]),
  summary: z.string(),
});
export const integrationToggleInputSchema = z
  .object({ key: integrationKeySchema, enabled: z.boolean() })
  .strict();
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
export const integrationsSchemas = {
  list: { input: z.void(), output: z.array(integrationStatusSchema) },
  toggle: {
    input: integrationToggleInputSchema,
    output: z.object({
      id: objectIdSchema,
      key: integrationKeySchema,
      enabled: z.boolean(),
      notes: z.string().optional(),
      updatedAt: z.coerce.date().optional(),
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
