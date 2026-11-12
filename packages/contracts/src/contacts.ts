import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import { z } from "zod";

// Adding a contact type means adding it here (and to SOCIAL_DOMAINS when it is a social link).
export const CONTACT_TYPES = [
  "phone",
  "email",
  "facebook",
  "linkedin",
  "instagram",
  "x",
  "other_social",
] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const SOCIAL_DOMAINS = {
  facebook: ["facebook.com", "fb.com"],
  linkedin: ["linkedin.com"],
  instagram: ["instagram.com"],
  x: ["x.com", "twitter.com"],
  other_social: null,
} as const satisfies Partial<Record<ContactType, readonly string[] | null>>;

/** Numbers without a country code are read as Philippine numbers; the result is E.164. */
export function normalizeContactPhone(value: string): string | null {
  const phone = parsePhoneNumberFromString(value.trim(), "PH");
  return phone?.isValid() ? phone.number : null;
}

export function socialUrlMatches(type: keyof typeof SOCIAL_DOMAINS, value: string): boolean {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;
  const domains = SOCIAL_DOMAINS[type];
  if (!domains) return true;
  const host = url.hostname.toLowerCase();
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

const label = z.string().trim().max(60).default("");
const phoneValue = z
  .string()
  .max(64)
  .transform((value, ctx) => {
    const normalized = normalizeContactPhone(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Enter a valid phone number." });
      return z.NEVER;
    }
    return normalized;
  });
const socialValue = (type: keyof typeof SOCIAL_DOMAINS) =>
  z
    .string()
    .trim()
    .max(2048)
    .refine((value) => socialUrlMatches(type, value), {
      message:
        type === "other_social" ? "Enter a valid http(s) link." : `Enter a valid ${type} link.`,
    });

const contact = <T extends ContactType, V extends z.ZodType>(type: T, value: V) =>
  z.object({ type: z.literal(type), value, label, isPrimary: z.boolean().default(false) }).strict();

export const contactInputSchema = z.discriminatedUnion("type", [
  contact("phone", phoneValue),
  contact("email", z.string().trim().toLowerCase().max(254).email()),
  contact("facebook", socialValue("facebook")),
  contact("linkedin", socialValue("linkedin")),
  contact("instagram", socialValue("instagram")),
  contact("x", socialValue("x")),
  contact("other_social", socialValue("other_social")),
]);
export type ContactInput = z.output<typeof contactInputSchema>;

export const contactOutputSchema = z.object({
  id: z.string(),
  alumniId: z.string(),
  type: z.enum(CONTACT_TYPES),
  value: z.string(),
  label: z.string().default(""),
  isPrimary: z.boolean(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Enter a valid record ID.");
export const contactsSchemas = {
  create: {
    input: z.object({ alumniId: objectId }).and(contactInputSchema),
    output: contactOutputSchema,
  },
  // Type is fixed after creation; the value is re-validated against the stored type.
  update: {
    input: z
      .object({
        alumniId: objectId,
        id: objectId,
        value: z.string().max(2048).optional(),
        label: z.string().trim().max(60).optional(),
        isPrimary: z.boolean().optional(),
      })
      .strict(),
    output: contactOutputSchema,
  },
  delete: {
    input: z.object({ alumniId: objectId, id: objectId }).strict(),
    output: z.object({ ok: z.boolean() }),
  },
};

const HANDLE_URLS: Record<Exclude<keyof typeof SOCIAL_DOMAINS, "other_social">, string> = {
  facebook: "https://www.facebook.com/",
  linkedin: "https://www.linkedin.com/in/",
  instagram: "https://www.instagram.com/",
  x: "https://x.com/",
};
/** Turns "@handle" or "handle" into the platform URL; full URLs pass through unchanged. */
export function socialUrlFromInput(type: keyof typeof SOCIAL_DOMAINS, input: string) {
  const value = input.trim();
  if (type === "other_social" || /^https?:\/\//i.test(value)) return value;
  const handle = value.replace(/^@/, "");
  return /^[A-Za-z0-9._-]{1,100}$/.test(handle) ? HANDLE_URLS[type] + handle : value;
}
