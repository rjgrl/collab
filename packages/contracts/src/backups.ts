import { z } from "zod";

export const backupScheduleSchema = z
  .object({
    frequency: z.enum(["off", "daily", "weekly"]),
    time: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Use a 24-hour time such as 02:00."),
    weekday: z.number().int().min(0).max(6),
    retention: z.number().int().min(1).max(90),
  })
  .strict();

export const backupEntrySchema = z.object({
  backupId: z.string(),
  createdAt: z.string(),
  type: z.enum(["manual", "scheduled", "pre-restore"]),
  status: z.enum(["running", "succeeded", "failed"]),
  sizeBytes: z.number().int().nonnegative(),
  createdBy: z.string(),
  verified: z.boolean(),
  error: z.string().optional(),
  offHost: z.enum(["copied", "failed", "skipped"]).optional(),
  manifest: z
    .object({
      appVersion: z.string(),
      schemaVersion: z.number().int(),
      databaseName: z.string(),
      collections: z.record(z.string(), z.number()),
      files: z.number().int().nonnegative(),
      keyFingerprints: z.object({ mfa: z.string().nullable(), integration: z.string().nullable() }),
    })
    .optional(),
});

export const restoreStatusSchema = z.object({
  status: z.enum(["idle", "running", "succeeded", "rolled-back", "stopped", "failed"]),
  step: z.string().nullable(),
  backupId: z.string().nullable(),
  error: z.string().nullable(),
  startedAt: z.coerce.date().nullable(),
  finishedAt: z.coerce.date().nullable(),
});

export const backupOverviewSchema = z.object({
  configured: z.object({ encryptionKey: z.boolean(), dir: z.boolean(), tools: z.boolean() }),
  running: z.object({
    appVersion: z.string(),
    schemaVersion: z.number().int(),
    keyFingerprints: z.object({ mfa: z.string().nullable(), integration: z.string().nullable() }),
  }),
  schedule: backupScheduleSchema,
  backups: z.array(backupEntrySchema),
  restore: restoreStatusSchema,
  maintenance: z.boolean(),
});

export const restoreInputSchema = z
  .object({
    id: z.string().regex(/^[0-9]{14}-[a-f0-9]{8}$/),
    confirmation: z.literal("RESTORE", { message: "Type RESTORE to confirm." }),
    code: z.string().regex(/^[0-9]{6}$/, "Enter the 6-digit code from your authenticator."),
  })
  .strict();

export const backupsSchemas = {
  overview: { input: z.void(), output: backupOverviewSchema },
  create: { input: z.void(), output: backupEntrySchema },
  import: { input: z.void(), output: backupEntrySchema },
  schedule: { input: backupScheduleSchema, output: backupScheduleSchema },
  restore: { input: restoreInputSchema, output: z.object({ started: z.literal(true) }) },
  restoreStatus: { input: z.void(), output: restoreStatusSchema },
  endMaintenance: { input: z.void(), output: z.object({ ok: z.literal(true) }) },
};
