import { z } from "zod";
import { objectIdSchema, paginationSchema } from "./common";
import { emailSchema } from "./auth";
import { structuredNameSchema } from "./names";
import { newPasswordSchema } from "./password-policy";

export const FACULTY_LEVELS = ["faculty", "department", "college"] as const;
export const facultyRoleLevelSchema = z.enum(FACULTY_LEVELS);
export type FacultyLevel = z.infer<typeof facultyRoleLevelSchema>;
export const FACULTY_LEVEL_LABELS: Record<FacultyLevel, string> = {
  faculty: "Faculty",
  department: "Department head",
  college: "College head",
};

const employeeNumberSchema = z.string().trim().min(1).max(40);

export const facultyCreateInputSchema = structuredNameSchema
  .pick({ firstName: true, lastName: true })
  .extend({
    email: emailSchema.transform((value) => value.toLowerCase()),
    employeeNumber: employeeNumberSchema,
    departmentId: objectIdSchema,
    roleLevel: facultyRoleLevelSchema.default("faculty"),
    // Optional: faculty can instead sign in with their institutional Google account.
    password: newPasswordSchema.optional(),
  })
  .strict();
export const facultyUpdateInputSchema = z
  .object({
    id: objectIdSchema,
    firstName: structuredNameSchema.shape.firstName.optional(),
    lastName: structuredNameSchema.shape.lastName.optional(),
    employeeNumber: employeeNumberSchema.optional(),
    departmentId: objectIdSchema.optional(),
    roleLevel: facultyRoleLevelSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict();
export const facultyListInputSchema = paginationSchema
  .extend({
    departmentId: objectIdSchema.optional(),
    active: z.enum(["true", "false"]).optional(),
  })
  .strict()
  .optional();

export const facultyOutputSchema = z.object({
  id: objectIdSchema,
  userId: objectIdSchema.nullable(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  employeeNumber: z.string(),
  departmentId: objectIdSchema.nullable(),
  department: z
    .object({ id: objectIdSchema, name: z.string(), collegeId: objectIdSchema })
    .nullable(),
  roleLevel: facultyRoleLevelSchema,
  active: z.boolean(),
  assignedCount: z.number().int(),
});

export const facultySchemas = {
  list: { input: facultyListInputSchema, output: z.array(facultyOutputSchema) },
  create: { input: facultyCreateInputSchema, output: facultyOutputSchema },
  update: { input: facultyUpdateInputSchema, output: facultyOutputSchema },
};

export const assignInputSchema = z
  .object({
    alumniIds: z
      .array(objectIdSchema)
      .min(1)
      .max(200)
      .refine((ids) => new Set(ids).size === ids.length, "Each alumnus may appear once."),
    // null unassigns.
    facultyId: objectIdSchema.nullable(),
  })
  .strict();
export const assignSchemas = {
  assign: { input: assignInputSchema, output: z.object({ updated: z.number().int() }) },
};
