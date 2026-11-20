import { z } from "zod";
import { objectIdSchema, dateSchema } from "./common";
import { employmentOutputSchema } from "./alumni";

export const TIMESTAMP_EDIT_HEADER = "X-Timestamp-Edit";
export const timestampPurposeSchema = z.enum(["details", "employment", "assignment", "account"]);
export const timestampSnapshotSchema = z.object({
  id: objectIdSchema,
  names: z.object({
    firstName: z.string(),
    middleName: z.string(),
    lastName: z.string(),
    suffix: z.string(),
  }),
  details: z
    .object({
      studentNumber: z.string(),
      programId: objectIdSchema,
      graduationYear: z.number().nullable(),
      gender: z.string(),
      batch: z.string(),
    })
    .optional(),
  employments: z.array(employmentOutputSchema).optional(),
  assignedFacultyId: objectIdSchema.nullable().optional(),
  account: z
    .object({ phoneNumber: z.string(), gender: z.string(), facebookAccount: z.string() })
    .optional(),
});
export const timestampEditSchemas = {
  begin: {
    input: z
      .object({
        purpose: timestampPurposeSchema,
        alumniIds: z.array(objectIdSchema).min(1).max(500),
      })
      .strict()
      .refine(
        (input) => input.purpose === "assignment" || input.alumniIds.length === 1,
        "Only assignment edits can include multiple alumni.",
      ),
    output: z.object({
      token: z.string().regex(/^[a-f\d]{64}$/),
      timestamp: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      expiresAt: dateSchema,
      snapshot: z.array(timestampSnapshotSchema),
    }),
  },
};
export type TimestampEdit = z.infer<typeof timestampEditSchemas.begin.output>;
export type TimestampPurpose = z.infer<typeof timestampPurposeSchema>;
