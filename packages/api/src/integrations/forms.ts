import { alumniImportRowSchema } from "../validation";
import type { AlumniImportRow } from "../validation";

export function mapFormPayload(payload: Record<string, unknown>): AlumniImportRow {
  const source = lowerKeys(payload);
  return alumniImportRowSchema.parse({
    studentNumber: pick(source, ["studentnumber", "student_number", "student no", "id number"]),
    firstName: pick(source, ["firstname", "first_name", "given name"]),
    lastName: pick(source, ["lastname", "last_name", "surname", "family name"]),
    middleName: pick(source, ["middlename", "middle_name"]),
    gender: pick(source, ["gender", "sex"]),
    graduationYear: pick(source, ["graduationyear", "graduation_year", "year graduated"]),
    batch: pick(source, ["batch", "year level"]),
    mobileNumber: pick(source, ["mobilenumber", "mobile", "mobile #", "phone"]),
    personalEmail: pick(source, ["personalemail", "email", "personal email"]),
    facebookAccount: pick(source, ["facebookaccount", "facebook", "facebook account"]),
    programCode: pick(source, ["programcode", "program_code", "program"]),
    departmentCode: pick(source, ["departmentcode", "department_code", "department"]),
    isTracked: pick(source, ["istracked", "tracked", "is_tracked"]),
  });
}

function lowerKeys(payload: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    result[key.toLowerCase().replaceAll(/[^a-z0-9#]+/g, "")] = value;
  }
  return result;
}

function pick(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const normalized = key.toLowerCase().replaceAll(/[^a-z0-9#]+/g, "");
    if (source[normalized] != null && source[normalized] !== "") {
      return source[normalized];
    }
  }
  return undefined;
}
