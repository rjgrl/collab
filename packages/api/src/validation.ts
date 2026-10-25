import { z } from "zod";
import {
  genderSchema,
  facebookSchema,
  graduationYearSchema,
  mobileSchema,
} from "@Alumni-Tracking-Ss/contracts/alumni";
export { objectIdSchema, paginationSchema } from "@Alumni-Tracking-Ss/contracts/common";
export {
  loginSchema,
  signupSchema,
  accountProfileSchema,
  emailSchema,
} from "@Alumni-Tracking-Ss/contracts/auth";
export {
  alumniInputSchema,
  employmentInputSchema,
  trackingInputSchema,
  genderSchema,
  facebookSchema,
  mobileSchema,
} from "@Alumni-Tracking-Ss/contracts/alumni";
export { departmentInputSchema, programInputSchema } from "@Alumni-Tracking-Ss/contracts/academic";

export const alumniImportRowSchema = z.object({
  studentNumber: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  middleName: z.string().trim().optional(),
  suffix: z.string().trim().max(40).optional(),
  gender: genderSchema,
  graduationYear: z.coerce.number().pipe(graduationYearSchema),
  mobileNumber: mobileSchema,
  personalEmail: z.string().trim().email().optional().or(z.literal("")),
  facebookAccount: facebookSchema,
  programCode: z.string().trim().min(1),
  departmentName: z.string().trim().min(1),
  isTracked: z
    .union([
      z.boolean(),
      z
        .string()
        .trim()
        .toLowerCase()
        .pipe(z.enum(["true", "false", "1", "0", "yes", "no", ""])),
    ])
    .optional()
    .transform((value) => {
      if (value === undefined || value === "") return undefined;
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

export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
) {
  const lines = [headers.map((header) => quoteCsv(header)).join(",")];
  for (const row of rows) {
    lines.push(
      row
        .map((cell) => {
          const value = cell == null ? "" : String(cell);
          return quoteCsv(
            typeof cell === "string" && /^[\s]*[=+\-@]/.test(cell) ? `'${value}` : value,
          );
        })
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function isEmail(value: string) {
  return EMAIL_RE.test(value);
}
