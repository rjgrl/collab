import { z } from "zod";
import { idInputSchema, objectIdSchema, paginationSchema, okSchema, dateSchema } from "./common";
import { structuredNameSchema } from "./names";
import { programOutputSchema } from "./academic";
import { normalizePhoneNumber, phoneNumberSchema } from "./phone";
import { contactOutputSchema } from "./contacts";
export const genderSchema = z.enum(["Male", "Female"]);
export const graduationYearSchema = z.number().int().min(1950).max(2100);
export const mobileSchema = z
  .union([
    phoneNumberSchema,
    z
      .string()
      .trim()
      .max(64)
      .regex(/^[0-9\s().\-\u2010-\u2015]*$/)
      .transform(normalizePhoneNumber)
      .pipe(z.string().regex(/^\d{0,30}$/)),
  ])
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
    graduationYear: graduationYearSchema,
    mobileNumber: mobileSchema,
    personalEmail: z.string().trim().max(254).email().optional().or(z.literal("")),
    facebookAccount: facebookSchema,
    programId: objectIdSchema,
    employmentStatus: z.enum(["employed", "unemployed", "unknown"]).optional(),
  })
  .strict();
// No default: an omitted field must mean "unchanged", never "cleared".
const optionalPlainText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value), "Remove control characters.")
    .optional();
export const alumniUpdateInputSchema = alumniInputSchema
  .pick({ studentNumber: true, programId: true, graduationYear: true })
  .extend({
    id: objectIdSchema,
    // Optional so older clients that send only academic fields keep working.
    firstName: structuredNameSchema.shape.firstName.optional(),
    middleName: optionalPlainText(80),
    lastName: structuredNameSchema.shape.lastName.optional(),
    suffix: optionalPlainText(30),
    gender: genderSchema.optional(),
    batch: z.string().trim().max(40).optional(),
  });
export const alumniListInputSchema = paginationSchema
  .extend({
    departmentId: objectIdSchema.optional(),
    programId: objectIdSchema.optional(),
    tracked: z.enum(["all", "tracked", "untracked"]).optional(),
    graduationYear: z.coerce.number().int().min(1950).max(2100).optional(),
    assignment: z.enum(["all", "mine", "unassigned", "needs_reassignment"]).optional(),
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
export const TRACKING_PAGE_SIZES = [10, 25, 50] as const;
export type TrackingPageSize = (typeof TRACKING_PAGE_SIZES)[number];
export const alumniOutputSchema = z.object({
  isRegistered: z.boolean().default(false),
  // Whether the signed-in staff member may upload, replace or remove this profile photo.
  canManagePhoto: z.boolean().default(false),
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
  assignedFacultyId: objectIdSchema.nullable().default(null),
  assignedFaculty: z.object({ id: objectIdSchema, name: z.string() }).nullable().default(null),
  needsReassignment: z.boolean().default(false),
  isTracked: z.boolean().default(false),
  employments: z.array(employmentOutputSchema).default([]),
  trackingEvents: z.array(trackingOutputSchema).default([]),
  evidenceFiles: z.array(evidenceOutputSchema).default([]),
  // Detail: every contact. List: primary contacts only.
  contacts: z.array(contactOutputSchema).default([]),
});
export const alumniHistoryEntrySchema = z.object({
  id: objectIdSchema,
  action: z.string(),
  entity: z.string(),
  summary: z.string(),
  createdAt: dateSchema,
  actor: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
  changes: z.array(z.object({ field: z.string(), old: z.unknown(), new: z.unknown() })).default([]),
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
  trackingEvents: {
    input: z
      .object({
        alumniId: objectIdSchema,
        page: z.coerce.number().int().min(1).max(100000).default(1),
        pageSize: z.coerce
          .number()
          .int()
          .refine((size) => TRACKING_PAGE_SIZES.includes(size as TrackingPageSize), {
            message: "Choose 10, 25 or 50 rows per page.",
          })
          .default(10),
      })
      .strict(),
    output: z.object({
      items: z.array(
        trackingOutputSchema.extend({ trackerName: z.string().nullable().default(null) }),
      ),
      page: z.number().int(),
      pageSize: z.number().int(),
      total: z.number().int(),
    }),
  },
  removePhoto: { input: z.object({ alumniId: objectIdSchema }).strict(), output: okSchema },
  linkAlumni: { input: linkAlumniInputSchema, output: okSchema },
  history: { input: idInputSchema, output: z.array(alumniHistoryEntrySchema) },
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
