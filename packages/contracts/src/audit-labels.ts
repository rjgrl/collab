/**
 * Human-readable labels and rendered summaries for audit entries.
 * Pure functions with no database dependencies.
 */

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  // Account management
  "account.photo.upload": "Uploaded profile photo",
  "account.photo.remove": "Removed profile photo",
  "reports.export": "Exported report",
  "reports.pdf.profile": "Generated profile PDF",
  "reports.pdf.alumni": "Exported alumni list PDF",
  "reports.pdf.assignments": "Exported assignments PDF",

  // Authentication
  "auth.login": "Signed in with password",
  "auth.logout": "Signed out",
  "auth.signup": "Registered account",
  "auth.google": "Signed in with Google",
  "auth.password": "Changed password",
  "auth.password.create": "Set password",
  "auth.password.reset": "Reset password",

  // Email verification
  "auth.email.change_requested": "Requested email change",
  "auth.email.changed": "Confirmed email change",
  "auth.email_verified": "Verified email address",
  "auth.phone_verified": "Verified phone number",

  // MFA
  "auth.mfa.enrolled": "Set up authenticator",
  "auth.mfa.verified": "Verified authenticator",
  "auth.mfa.recovery": "Used recovery code",
  "auth.mfa.local_recovery": "Used local recovery code",

  // Profile
  "auth.profile.complete": "Completed profile",
  "auth.profile.update": "Updated profile",

  // Academic organization
  "colleges.create": "Created college",
  "colleges.update": "Updated college",
  "colleges.delete": "Archived college",
  "departments.create": "Created department",
  "departments.update": "Updated department",
  "departments.delete": "Archived department",
  "programs.create": "Created program",
  "programs.update": "Updated program",
  "programs.delete": "Archived program",

  // Alumni
  "alumni.update": "Updated alumni profile",
  "alumni.delete": "Archived alumni",
  "alumni.import.create": "Created alumni from import",
  "alumni.import.update": "Updated alumni from import",
  "contacts.create": "Added contact information",
  "contacts.update": "Updated contact information",
  "contacts.delete": "Removed contact information",

  // Faculty
  "faculty.create": "Added faculty member",
  "faculty.role": "Changed faculty role",

  // User management
  "users.create": "Created account",
  "users.update": "Updated account",
  "users.status": "Changed account status",

  // Role management
  "roles.create": "Created role",
  "roles.update": "Updated role permissions",
  "roles.delete": "Deleted role",

  // Files
  "files.upload": "Uploaded file",
  "files.delete": "Deleted file",

  // Tracking
  "tracking.create": "Started tracking alumni",

  // Integrations
  "integrations.import": "Ran import",
  "integrations.toggle": "Toggled integration",
  "integrations.enable": "Enabled integration",
  "integrations.update": "Updated integration credentials",
  "integrations.disable": "Disabled integration",

  // Employment
  "employment.create": "Created employment record",
  "employment.update": "Updated employment record",
  "employment.delete": "Deleted employment record",
  "employment.self.create": "Created employment record",
  "employment.self.update": "Updated employment record",
  "employment.self.delete": "Deleted employment record",

  // Faculty
  "faculty.update": "Updated faculty member",
};

/**
 * Return a human-readable label for an audit action.
 * Falls back to sentence-cased key if no label is defined.
 */
export function auditActionLabel(action: string): string {
  if (action in AUDIT_ACTION_LABELS) {
    return AUDIT_ACTION_LABELS[action]!;
  }
  // Fallback: sentence-case the key (split on . and _, lowercase all, then capitalize first)
  const words = action.split(/[._]+/).map((word) => word.toLowerCase());
  const firstWord = words[0]!;
  const rest = words.slice(1).join(" ");
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1) + (rest ? " " + rest : "");
}

export const AUDIT_FIELD_LABELS: Record<string, string> = {
  code: "Code",
  name: "Name",
  description: "Description",
  firstName: "First name",
  middleName: "Middle name",
  lastName: "Last name",
  suffix: "Suffix",
  email: "Email",
  phoneNumber: "Phone number",
  gender: "Gender",
  facebookAccount: "Facebook account",
  studentNumber: "Student number",
  programId: "Program",
  departmentId: "Department",
  graduationYear: "Graduation year",
  mobileNumber: "Mobile number",
  personalEmail: "Personal email",
  isTracked: "Tracked",
  employer: "Employer",
  jobTitle: "Job title",
  industry: "Industry",
  location: "Location",
  startDate: "Start date",
  endDate: "End date",
  isCurrent: "Current",
  status: "Status",
  notes: "Notes",
  roleIds: "Roles",
  permissionKeys: "Permissions",
  enabled: "Enabled",
  alumniId: "Alumni",
  collegeId: "College",
  employeeNumber: "Employee number",
  roleLevel: "Role level",
  active: "Active",
  assignedFacultyId: "Assigned faculty",
  batch: "Batch",
  type: "Type",
  value: "Value",
  label: "Label",
  isPrimary: "Primary",
};

// Entity-specific field label overrides
const ENTITY_FIELD_OVERRIDES: Record<string, Record<string, string>> = {
  role: {
    description: "Note",
  },
};

/**
 * Return a human-readable label for an audit field.
 * Falls back to sentence-cased field name if no label is defined.
 */
export function auditFieldLabel(entity: string, field: string): string {
  // Check entity-specific override first
  if (entity in ENTITY_FIELD_OVERRIDES && field in ENTITY_FIELD_OVERRIDES[entity]!) {
    return ENTITY_FIELD_OVERRIDES[entity]![field]!;
  }

  if (field in AUDIT_FIELD_LABELS) {
    return AUDIT_FIELD_LABELS[field]!;
  }

  // Fallback: sentence-case the field (split on word boundaries, capitalize only first)
  const withSpaces = field.replace(/([A-Z])/g, " $1").trim();
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1).toLowerCase();
}

/**
 * JSON tokenizer state
 */
interface JSONTokens {
  type: "string" | "number" | "boolean" | "null" | "array" | "object";
  value: unknown;
  endIndex: number;
}

/**
 * Parse a JSON value starting at the given index.
 * Returns { value, endIndex } or null if parsing fails.
 */
function parseJSON(text: string, startIndex: number): JSONTokens | null {
  let i = startIndex;

  // Skip whitespace
  while (i < text.length && /\s/.test(text[i]!)) i++;

  if (i >= text.length) return null;

  const char = text[i]!;

  // String
  if (char === '"') {
    i++;
    let value = "";
    while (i < text.length) {
      const c = text[i]!;
      if (c === '"') {
        return { type: "string", value, endIndex: i + 1 };
      }
      if (c === "\\") {
        i++;
        if (i >= text.length) return null;
        // Accept escaped characters
        const escaped = text[i]!;
        if (escaped === '"' || escaped === "\\" || escaped === "/") {
          value += escaped;
        } else if (escaped === "b") {
          value += "\b";
        } else if (escaped === "f") {
          value += "\f";
        } else if (escaped === "n") {
          value += "\n";
        } else if (escaped === "r") {
          value += "\r";
        } else if (escaped === "t") {
          value += "\t";
        } else if (escaped === "u") {
          i++;
          const hex = text.slice(i, i + 4);
          if (hex.length !== 4) return null;
          value += String.fromCharCode(parseInt(hex, 16));
          i += 3;
        } else {
          value += escaped;
        }
      } else {
        value += c;
      }
      i++;
    }
    return null;
  }

  // Number
  if (char === "-" || /\d/.test(char)) {
    let value = "";
    if (char === "-") {
      value += "-";
      i++;
    }
    while (i < text.length && /\d/.test(text[i]!)) {
      value += text[i];
      i++;
    }
    if (i < text.length && text[i] === ".") {
      value += ".";
      i++;
      while (i < text.length && /\d/.test(text[i]!)) {
        value += text[i];
        i++;
      }
    }
    if (i < text.length && (text[i] === "e" || text[i] === "E")) {
      value += text[i];
      i++;
      if (i < text.length && (text[i] === "+" || text[i] === "-")) {
        value += text[i];
        i++;
      }
      while (i < text.length && /\d/.test(text[i]!)) {
        value += text[i];
        i++;
      }
    }
    return { type: "number", value: parseFloat(value), endIndex: i };
  }

  // Boolean
  if (text.slice(i, i + 4) === "true") {
    return { type: "boolean", value: true, endIndex: i + 4 };
  }
  if (text.slice(i, i + 5) === "false") {
    return { type: "boolean", value: false, endIndex: i + 5 };
  }

  // Null
  if (text.slice(i, i + 4) === "null") {
    return { type: "null", value: null, endIndex: i + 4 };
  }

  // Array
  if (char === "[") {
    const arr: unknown[] = [];
    i++;
    // Skip whitespace
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (i < text.length && text[i] === "]") {
      return { type: "array", value: arr, endIndex: i + 1 };
    }
    while (i < text.length) {
      const elem = parseJSON(text, i);
      if (!elem) return null;
      arr.push(elem.value);
      i = elem.endIndex;
      // Skip whitespace
      while (i < text.length && /\s/.test(text[i]!)) i++;
      if (i >= text.length) return null;
      if (text[i] === "]") {
        return { type: "array", value: arr, endIndex: i + 1 };
      }
      if (text[i] !== ",") return null;
      i++;
      // Skip whitespace
      while (i < text.length && /\s/.test(text[i]!)) i++;
    }
    return null;
  }

  // Object
  if (char === "{") {
    const obj: Record<string, unknown> = {};
    i++;
    // Skip whitespace
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (i < text.length && text[i] === "}") {
      return { type: "object", value: obj, endIndex: i + 1 };
    }
    while (i < text.length) {
      // Parse key
      while (i < text.length && /\s/.test(text[i]!)) i++;
      if (i >= text.length || text[i] !== '"') return null;
      const keyToken = parseJSON(text, i);
      if (!keyToken || keyToken.type !== "string") return null;
      i = keyToken.endIndex;
      // Skip whitespace and colon
      while (i < text.length && /\s/.test(text[i]!)) i++;
      if (i >= text.length || text[i] !== ":") return null;
      i++;
      // Parse value
      const valToken = parseJSON(text, i);
      if (!valToken) return null;
      obj[keyToken.value as string] = valToken.value;
      i = valToken.endIndex;
      // Skip whitespace
      while (i < text.length && /\s/.test(text[i]!)) i++;
      if (i >= text.length) return null;
      if (text[i] === "}") {
        return { type: "object", value: obj, endIndex: i + 1 };
      }
      if (text[i] !== ",") return null;
      i++;
      // Skip whitespace
      while (i < text.length && /\s/.test(text[i]!)) i++;
    }
    return null;
  }

  return null;
}

/**
 * Render a JSON value as human-readable text.
 * - Strings: keep JSON quotes
 * - null → "none"
 * - booleans → "yes"/"no"
 * - empty arrays → "none"
 * - arrays: comma-separated
 * - roleIds: render as role names if available in the names map
 * - permissionKeys: render as permission names if available in the names map
 * - other objects: JSON fallback
 */
function renderJSONValue(
  value: unknown,
  field: string,
  names: { roles: Record<string, string>; permissions: Record<string, string> },
): string {
  if (value === null) {
    return "none";
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (field === "roleIds") {
      return (value as string[]).map((id) => names.roles[id] ?? id).join(", ");
    }
    if (field === "permissionKeys") {
      return (value as string[]).map((key) => names.permissions[key] ?? key).join(", ");
    }
    // Other arrays: comma-separated
    return (value as unknown[]).map((item) => renderJSONValue(item, field, names)).join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Render an audit summary with human-readable labels and values.
 * Expects stored summaries in the format: `[optional prefix ]field: <JSON> → <JSON>; field2: ...`
 * or "No audited fields changed."
 * Returns the original summary unchanged on any parse failure.
 */
export function renderAuditSummary(
  row: { entity: string; summary: string },
  names: { roles: Record<string, string>; permissions: Record<string, string> },
): string {
  // Handle the special "no changes" case
  if (row.summary === "No audited fields changed.") {
    return row.summary;
  }

  const text = row.summary;
  let i = 0;

  // Find the optional prefix (everything before the first field name with colon)
  // Prefix must start at index 0 or right after a space
  let prefixEnd = -1;
  for (let searchStart = 0; searchStart < text.length; searchStart++) {
    // Only look for field names at word boundaries
    if (searchStart > 0 && text[searchStart - 1] !== " ") continue;

    // Look for identifier pattern: letters/numbers/underscores followed by ": "
    if (/[a-zA-Z_][a-zA-Z0-9_]*/.test(text[searchStart]!)) {
      let j = searchStart;
      while (j < text.length && /[a-zA-Z0-9_]/.test(text[j]!)) {
        j++;
      }
      // Check if followed by ": " (colon then ONE space)
      if (j < text.length && text[j] === ":" && j + 1 < text.length && text[j + 1] === " ") {
        prefixEnd = searchStart;
        i = searchStart;
        break;
      }
    }
  }

  // If no field found, return original
  if (prefixEnd === -1) {
    return text;
  }

  const prefix = text.slice(0, prefixEnd);
  const segments: string[] = [];

  while (i < text.length) {
    // Skip whitespace
    while (i < text.length && /\s/.test(text[i]!)) i++;

    if (i >= text.length) break;

    // Parse field name
    let fieldName = "";
    while (i < text.length && /[a-zA-Z0-9_]/.test(text[i]!)) {
      fieldName += text[i];
      i++;
    }

    if (!fieldName) return text; // Failed to parse field name, return original

    // Skip whitespace and expect colon followed by space
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (i >= text.length || text[i] !== ":") return text;
    i++;
    if (i >= text.length || text[i] !== " ") return text;
    i++;

    // Parse old value
    const oldToken = parseJSON(text, i);
    if (!oldToken) return text;
    const oldValue = oldToken.value;
    i = oldToken.endIndex;

    // Skip whitespace
    while (i < text.length && /\s/.test(text[i]!)) i++;

    // Expect →
    if (i >= text.length || text[i] !== "→") return text;
    i++;

    // Skip whitespace
    while (i < text.length && /\s/.test(text[i]!)) i++;

    // Parse new value
    const newToken = parseJSON(text, i);
    if (!newToken) return text;
    const newValue = newToken.value;
    i = newToken.endIndex;

    // Render segment
    const label = auditFieldLabel(row.entity, fieldName);
    const oldRendered = renderJSONValue(oldValue, fieldName, names);
    const newRendered = renderJSONValue(newValue, fieldName, names);
    segments.push(`${label}: ${oldRendered} → ${newRendered}`);

    // Skip whitespace
    while (i < text.length && /\s/.test(text[i]!)) i++;

    // Check for segment separator
    if (i >= text.length) {
      // Clean end of input - success
      break;
    } else if (text[i] === ";") {
      i++;
    } else {
      // Unparseable text, return original
      return text;
    }
  }

  // If we successfully parsed segments, return rendered output
  if (segments.length > 0) {
    return prefix + segments.join("; ");
  }

  // If no segments were parsed, return original
  return text;
}
