import { z } from "zod";
import { idInputSchema, objectIdSchema, paginationSchema, okSchema } from "./common";
const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/)
  .transform((v) => v.toUpperCase());
const orgUnitInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000).optional(),
  })
  .strict();
export const collegeInputSchema = orgUnitInputSchema;
export const collegeListInputSchema = paginationSchema.strict().optional();
export const departmentInputSchema = orgUnitInputSchema.extend({ collegeId: objectIdSchema });
// Omitting collegeId keeps the department in its current college.
export const departmentUpdateInputSchema = departmentInputSchema.extend({
  id: objectIdSchema,
  collegeId: objectIdSchema.optional(),
});
export const departmentListInputSchema = paginationSchema
  .extend({ collegeId: objectIdSchema.optional() })
  .strict()
  .optional();
export const programInputSchema = orgUnitInputSchema.extend({
  code: codeSchema,
  departmentId: objectIdSchema,
});
export const programUpdateInputSchema = programInputSchema.extend({ id: objectIdSchema });
export const programListInputSchema = paginationSchema
  .extend({ departmentId: objectIdSchema.optional() })
  .strict()
  .optional();
const departmentFields = {
  id: objectIdSchema,
  name: z.string(),
  description: z.string().default(""),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
};
export const collegeOutputSchema = z.object({
  ...departmentFields,
  _count: z.object({ departments: z.number() }).default({ departments: 0 }),
});
export const departmentOutputSchema = z.object({
  ...departmentFields,
  collegeId: objectIdSchema,
  college: z.object({ id: objectIdSchema, name: z.string() }).optional(),
  _count: z
    .object({ programs: z.number(), faculties: z.number().optional() })
    .default({ programs: 0 }),
  programs: z
    .array(
      z.object({
        id: objectIdSchema,
        code: z.string(),
        name: z.string(),
        description: z.string().optional(),
        departmentId: objectIdSchema,
      }),
    )
    .optional(),
});
export const programOutputSchema = z.object({
  ...departmentFields,
  code: z.string(),
  departmentId: objectIdSchema,
  department: departmentOutputSchema,
  _count: z.object({ alumni: z.number() }).default({ alumni: 0 }),
});
export const collegesSchemas = {
  list: { input: collegeListInputSchema, output: z.array(collegeOutputSchema) },
  create: { input: collegeInputSchema, output: collegeOutputSchema },
  update: { input: collegeInputSchema.extend({ id: objectIdSchema }), output: collegeOutputSchema },
  delete: { input: idInputSchema, output: okSchema },
};
export const departmentsSchemas = {
  list: { input: departmentListInputSchema, output: z.array(departmentOutputSchema) },
  get: { input: idInputSchema, output: departmentOutputSchema },
  create: { input: departmentInputSchema, output: departmentOutputSchema },
  update: { input: departmentUpdateInputSchema, output: departmentOutputSchema },
  delete: { input: idInputSchema, output: okSchema },
};
export const programsSchemas = {
  list: { input: programListInputSchema, output: z.array(programOutputSchema) },
  get: { input: idInputSchema, output: programOutputSchema },
  create: { input: programInputSchema, output: programOutputSchema },
  update: { input: programUpdateInputSchema, output: programOutputSchema },
  delete: { input: idInputSchema, output: okSchema },
};
