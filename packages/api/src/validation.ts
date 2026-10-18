import { z } from "zod";

export const objectIdSchema = z.string().min(1);

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
});

export const emailSchema = z.string().trim().email();

export const optionalEmailSchema = z
  .string()
  .trim()
  .email()
  .optional()
  .or(z.literal("").transform(() => undefined));

export const mobileSchema = z
  .string()
  .trim()
  .max(30)
  .regex(/^[0-9+\-() ]+$/, "Enter a valid mobile number.")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const facebookSchema = z
  .string()
  .trim()
  .max(200)
  .optional()
  .or(z.literal("").transform(() => undefined));

export const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, dashes, or underscores.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(128),
  recaptchaToken: z.string().optional(),
  recaptchaFallback: z.boolean().optional(),
});

export const signupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: z.string().min(8).max(128),
  recaptchaToken: z.string().optional(),
  recaptchaFallback: z.boolean().optional(),
});

export const departmentInputSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
});

export const programInputSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  departmentId: objectIdSchema,
});

export const facultyInputSchema = z.object({
  employeeNumber: z.string().trim().min(1).max(40),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: optionalEmailSchema,
  departmentIds: z.array(objectIdSchema).default([]),
});

export const alumniInputSchema = z.object({
  studentNumber: z.string().trim().min(1).max(40),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  middleName: z.string().trim().max(80).optional(),
  gender: z.string().trim().max(40).optional(),
  graduationYear: z.number().int().min(1950).max(2100).optional(),
  batch: z.string().trim().max(40).optional(),
  mobileNumber: mobileSchema,
  personalEmail: optionalEmailSchema,
  facebookAccount: facebookSchema,
  programId: objectIdSchema,
  employmentStatus: z.enum(["employed", "unemployed", "unknown"]).optional(),
});

export const employmentInputSchema = z.object({
  alumniId: objectIdSchema,
  employer: z.string().trim().min(1).max(160),
  jobTitle: z.string().trim().max(160).optional(),
  industry: z.string().trim().max(160).optional(),
  location: z.string().trim().max(160).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  isCurrent: z.boolean().default(false),
  status: z.enum(["employed", "unemployed", "unknown"]).default("employed"),
  notes: z.string().trim().max(2000).optional(),
});

export const trackingInputSchema = z.object({
  alumniId: objectIdSchema,
  isTracked: z.boolean(),
  notes: z.string().trim().max(2000).optional(),
  source: z.string().trim().max(40).optional(),
});

export const userInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: z.string().min(8).max(128).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  roleIds: z.array(objectIdSchema).default([]),
});

export const roleInputSchema = z.object({
  key: codeSchema,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400).optional(),
  permissionIds: z.array(objectIdSchema).default([]),
});

export const alumniImportRowSchema = z.object({
  studentNumber: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  middleName: z.string().trim().optional(),
  gender: z.string().trim().optional(),
  graduationYear: z.coerce.number().int().optional(),
  batch: z.string().trim().optional(),
  mobileNumber: z.string().trim().optional(),
  personalEmail: z.string().trim().email().optional().or(z.literal("")),
  facebookAccount: z.string().trim().optional(),
  programCode: z.string().trim().min(1),
  departmentCode: z.string().trim().min(1),
  isTracked: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (value === true || value === "true" || value === "1" || value === "yes") {
        return true;
      }
      return false;
    }),
});

export type AlumniImportRow = z.infer<typeof alumniImportRowSchema>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(current);
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((cell) => cell.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

export function csvToObjects(text: string) {
  const rows = parseCsv(text);
  const header = rows[0];
  if (!header) {
    return [];
  }

  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key.trim()] = (row[index] ?? "").trim();
    });
    return record;
  });
}

export function quoteCsv(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function toCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>) {
  const lines = [headers.map((header) => quoteCsv(header)).join(",")];
  for (const row of rows) {
    lines.push(row.map((cell) => quoteCsv(cell == null ? "" : String(cell))).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function isEmail(value: string) {
  return EMAIL_RE.test(value);
}
