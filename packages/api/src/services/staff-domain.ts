import { ROLE } from "@Alumni-Tracking-Ss/contracts/names";
import { ApiError } from "../http-error";

/** Distinguishes domain rejections so sign-in flows can show a specific message. */
export class StaffDomainError extends ApiError {
  constructor(message: string) {
    super("FORBIDDEN", { message });
  }
}

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Institutional (BukSU) domains every account must use, from STAFF_EMAIL_DOMAINS
 * (comma-separated; the name predates the rule covering Alumni too). Unset means unrestricted,
 * which is only allowed outside production; production refuses to start.
 */
export function staffEmailDomains(settings: NodeJS.ProcessEnv = process.env): string[] | null {
  const raw = settings.STAFF_EMAIL_DOMAINS?.trim();
  if (!raw) {
    if (settings.NODE_ENV === "production")
      throw new Error(
        "Configure STAFF_EMAIL_DOMAINS (for example buksu.edu.ph,student.buksu.edu.ph).",
      );
    return null;
  }
  const domains = [...new Set(raw.split(",").map((domain) => domain.trim().toLowerCase()))].filter(
    Boolean,
  );
  const invalid = domains.filter((domain) => !HOSTNAME.test(domain));
  if (!domains.length || invalid.length)
    throw new Error("STAFF_EMAIL_DOMAINS must be a comma-separated list of plain domain names.");
  return domains;
}

/** Exact match on the part after the only "@"; subdomains and lookalikes never match. */
export function emailDomainAllowed(email: string, domains: readonly string[]): boolean {
  const normalized = email.trim().toLowerCase();
  const parts = normalized.split("@");
  if (parts.length !== 2 || !parts[0]) return false;
  return domains.includes(parts[1]!);
}

/** Any role besides the Alumni role makes an account staff (Super Admin, Faculty, custom). */
export function isStaffAccount(roles: readonly string[]) {
  return roles.some((role) => role !== ROLE.alumni);
}

/**
 * Every account, Alumni included, must use an institutional email. `roles` is kept for callers
 * and future per-role rules; it no longer exempts anyone.
 */
export function staffEmailRejected(
  email: string,
  _roles: readonly string[] = [],
  settings: NodeJS.ProcessEnv = process.env,
) {
  const domains = staffEmailDomains(settings);
  return Boolean(domains && !emailDomainAllowed(email, domains));
}

export function assertStaffEmailAllowed(
  email: string,
  roles: readonly string[] = [],
  settings: NodeJS.ProcessEnv = process.env,
) {
  if (staffEmailRejected(email, roles, settings))
    throw new StaffDomainError(
      `Use your BukSU institutional email (${staffEmailDomains(settings)!
        .map((domain) => `@${domain}`)
        .join(", ")}).`,
    );
}

/**
 * Google identities must come from an allowlisted Workspace: the `hd` claim (from a verified
 * ID token, never the `hd` request parameter) and the email domain must both match.
 */
export function assertStaffGoogleIdentity(
  email: string,
  hostedDomain: string | null | undefined,
  roles: readonly string[] = [],
  settings: NodeJS.ProcessEnv = process.env,
) {
  assertStaffEmailAllowed(email, roles, settings);
  const domains = staffEmailDomains(settings);
  if (domains && !(hostedDomain && domains.includes(hostedDomain.toLowerCase())))
    throw new StaffDomainError("Sign in with your BukSU Google Workspace account.");
}
