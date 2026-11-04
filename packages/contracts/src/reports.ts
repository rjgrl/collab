import { z } from "zod";
import { objectIdSchema } from "./common";
export const dashboardSummaryInputSchema = z
  .object({
    departmentId: objectIdSchema.optional(),
    tracked: z.enum(["all", "tracked", "untracked"]).optional(),
  })
  .strict()
  .optional();
export const departmentStatisticsSchema = z.object({
  id: objectIdSchema,
  name: z.string(),
  graduates: z.number().int(),
  tracked: z.number().int(),
  percentTracked: z.number(),
});
export const dashboardSummaryOutputSchema = z.object({
  registered: z.number().int().optional(),
  graduates: z.number().int(),
  tracked: z.number().int(),
  untracked: z.number().int(),
  percentTracked: z.number(),
  formula: z.string(),
  conflictNote: z.string(),
  byDepartment: z.array(departmentStatisticsSchema),
});
export const reportsSummaryOutputSchema = z.object({
  registered: z.number().int().optional(),
  untracked: z.number().int().optional(),
  graduates: z.number().int(),
  tracked: z.number().int(),
  percentTracked: z.number(),
  departments: z.array(z.object({ id: objectIdSchema, name: z.string() })),
});
/** Filters shared by the CSV and PDF alumni exports. */
export const alumniCsvInputSchema = z
  .object({
    collegeId: objectIdSchema.optional(),
    departmentId: objectIdSchema.optional(),
    programId: objectIdSchema.optional(),
    graduationYear: z.coerce.number().int().min(1950).max(2100).optional(),
    batch: z.string().trim().max(40).optional(),
    tracked: z.enum(["all", "tracked", "untracked"]).optional(),
  })
  .strict()
  .optional();
export const alumniCsvOutputSchema = z.object({
  csv: z.string(),
  fileName: z.string(),
  count: z.number().int(),
});
export const dashboardSchemas = {
  summary: { input: dashboardSummaryInputSchema, output: dashboardSummaryOutputSchema },
};
export const reportsSchemas = {
  summary: { input: dashboardSummaryInputSchema, output: reportsSummaryOutputSchema },
  alumniCsv: { input: alumniCsvInputSchema, output: alumniCsvOutputSchema },
};
export const pdfReportSchemas = {
  alumniList: alumniCsvInputSchema,
  profile: z.object({ id: objectIdSchema }).strict(),
  assignments: z.object({}).strict().optional(),
};
export const aggregateSchemas = {
  summary: {
    input: z.object({}).strict().default({}),
    output: z.object({
      suppressed: z.boolean(),
      minimumCohort: z.number(),
      message: z.string(),
      totals: z
        .object({
          graduates: z.number().int(),
          tracked: z.number().int(),
          untracked: z.number().int(),
          percentTracked: z.number(),
        })
        .nullable(),
      byDepartment: z.array(departmentStatisticsSchema),
    }),
  },
};
