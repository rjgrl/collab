import { z } from "zod";
import { idInputSchema, objectIdSchema, paginationSchema, okSchema, dateSchema } from "./common";
import { structuredNameSchema } from "./names";
import { programOutputSchema } from "./academic";
export const genderSchema = z.enum(["Male", "Female"]);
export const mobileSchema = z
  .string()
  .trim()
  .max(30)
  .regex(/^[0-9+() -]*$/)
  .optional();
export const facebookSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      const u = new URL(value);
      return (
        ["http:", "https:"].includes(u.protocol) &&
        !u.username &&
        !u.password &&
        (u.hostname === "facebook.com" ||
          u.hostname.endsWith(".facebook.com") ||
          u.hostname === "fb.com")
      );
    } catch {
      return false;
    }
  }, "Enter a full Facebook profile URL.")
  .optional();
export const alumniInputSchema = structuredNameSchema
  .extend({
    studentNumber: z.string().trim().min(1).max(40),
    gender: genderSchema,
    graduationYear: z.number().int().min(1950).max(2100).optional(),
    mobileNumber: mobileSchema,
    personalEmail: z.string().trim().max(254).email().optional().or(z.literal("")),
    facebookAccount: facebookSchema,
    programId: objectIdSchema,
    employmentStatus: z.enum(["employed", "unemployed", "unknown"]).optional(),
  })
  .strict();
export const alumniUpdateInputSchema = alumniInputSchema
  .pick({ studentNumber: true, programId: true, graduationYear: true })
  .extend({ id: objectIdSchema });
export const alumniListInputSchema = paginationSchema
  .extend({
    departmentId: objectIdSchema.optional(),
    programId: objectIdSchema.optional(),
    tracked: z.enum(["all", "tracked", "untracked"]).optional(),
    graduationYear: z.coerce.number().int().min(1950).max(2100).optional(),
  })
  .strict()
  .optional();
export const selfEmploymentInputSchema = z
  .object({
    employer: z.string().trim().min(1).max(160),
    jobTitle: z.string().trim().max(160).optional(),
    industry: z.string().trim().max(160).optional(),
    location: z.string().trim().max(160).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    isCurrent: z.boolean().default(false),
    status: z.enum(["employed", "unemployed", "unknown"]).default("employed"),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine((v) => !v.startDate || !v.endDate || new Date(v.endDate) >= new Date(v.startDate), {
    message: "End date must not precede start date.",
    path: ["endDate"],
  })
  .refine(
    (v) => !v.isCurrent || (!v.endDate && v.status === "employed"),
    "A current job must be employed and have no end date.",
  );
export const employmentInputSchema = selfEmploymentInputSchema.safeExtend({
  alumniId: objectIdSchema,
});
export const trackingInputSchema = z
  .object({
    alumniId: objectIdSchema,
    isTracked: z.boolean(),
    notes: z.string().trim().max(2000).optional(),
    source: z.string().trim().max(40).optional(),
  })
  .strict();
export const meProfileUpdateSchema = z
  .object({})
  .strict()
  .refine(() => false, "Edit personal details in Settings → Account.");
export const linkAlumniInputSchema = z
  .object({ id: objectIdSchema, alumniId: objectIdSchema })
  .strict();
const text = z.string().nullable().optional();
const date = dateSchema.nullable().optional();
export const evidenceOutputSchema = z.object({
  employmentId: objectIdSchema.nullable().optional(),
  id: objectIdSchema,
  originalName: z.string(),
  mimeType: z.string(),
  provider: z.enum(["local", "google_drive", "imgbb"]).optional(),
  sizeBytes: z.number(),
  kind: z.string(),
  createdAt: dateSchema.optional(),
});
export const employmentOutputSchema = z.object({
  id: objectIdSchema,
  alumniId: objectIdSchema,
  employer: z.string(),
  jobTitle: text,
  industry: text,
  location: text,
  startDate: date,
  endDate: date,
  isCurrent: z.boolean(),
  status: z.enum(["employed", "unemployed", "unknown"]),
  notes: z.string().default(""),
  createdAt: date,
  updatedAt: date,
});
export const trackingOutputSchema = z.object({
  id: objectIdSchema,
  alumniId: objectIdSchema,
  isTracked: z.boolean(),
  notes: z.string().default(""),
  source: z.string().default("manual"),
  recordedAt: date,
  createdAt: date,
  createdById: objectIdSchema.nullable().optional(),
});
export const alumniOutputSchema = z.object({
  isRegistered: z.boolean().default(false),
  id: objectIdSchema,
  studentNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  middleName: text,
  suffix: text,
  gender: text,
  graduationYear: z.number().int().nullable().optional(),
  batch: text,
  mobileNumber: text,
  personalEmail: text,
  facebookAccount: text,
  employmentStatus: z.enum(["employed", "unemployed", "unknown"]).default("unknown"),
  photoUrl: text,
  createdAt: date,
  updatedAt: date,
  lastTrackedAt: date,
  programId: objectIdSchema,
  program: programOutputSchema,
  isTracked: z.boolean().default(false),
  employments: z.array(employmentOutputSchema).default([]),
  trackingEvents: z.array(trackingOutputSchema).default([]),
  evidenceFiles: z.array(evidenceOutputSchema).default([]),
});
export const alumniSchemas = {
  pendingAccounts: {
    input: paginationSchema.strict(),
    output: z.array(
      z.object({
        id: objectIdSchema,
        name: z.string(),
        email: z.string().email(),
        createdAt: dateSchema,
      }),
    ),
  },
  list: { input: alumniListInputSchema, output: z.array(alumniOutputSchema) },
  get: { input: idInputSchema, output: alumniOutputSchema },
  create: { input: alumniInputSchema, output: alumniOutputSchema },
  update: { input: alumniUpdateInputSchema, output: alumniOutputSchema },
  delete: { input: idInputSchema, output: okSchema },
  addEmployment: { input: employmentInputSchema, output: employmentOutputSchema },
  deleteEmployment: { input: idInputSchema, output: okSchema },
  updateEmployment: {
    input: selfEmploymentInputSchema.safeExtend({ id: objectIdSchema }),
    output: employmentOutputSchema,
  },
  addTracking: { input: trackingInputSchema, output: trackingOutputSchema },
  linkAlumni: { input: linkAlumniInputSchema, output: okSchema },
};
export const selfEmploymentSchemas = {
  create: { input: selfEmploymentInputSchema, output: employmentOutputSchema },
  update: {
    input: selfEmploymentInputSchema.safeExtend({ id: objectIdSchema }),
    output: employmentOutputSchema,
  },
  remove: { input: idInputSchema, output: okSchema },
};
export const meProfileSchemas = {
  get: { input: z.void(), output: alumniOutputSchema },
  update: { input: meProfileUpdateSchema, output: alumniOutputSchema },
};
export const filesSchemas = { remove: { input: idInputSchema, output: okSchema } };
export const uploadOutputSchema = z.object({
  id: objectIdSchema,
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
});
export const selfUploadInputSchema = z
  .object({
    kind: z.enum(["image", "evidence"]).default("evidence"),
    employmentId: objectIdSchema.optional(),
  })
  .strict();
