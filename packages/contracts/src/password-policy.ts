import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;

/** Length in Unicode code points after NFC normalization. */
export function passwordLength(value: string): number {
  return Array.from(value.normalize("NFC")).length;
}

export type PasswordRequirement = {
  id: string;
  label: string;
  test: (value: string) => boolean;
};

/** Single source of truth for the sign-up checklist and server validation. */
export const PASSWORD_REQUIREMENTS: readonly PasswordRequirement[] = [
  {
    id: "min-length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (value) => passwordLength(value) >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "max-length",
    label: `No more than ${PASSWORD_MAX_LENGTH} characters`,
    test: (value) => passwordLength(value) <= PASSWORD_MAX_LENGTH,
  },
  {
    id: "uppercase",
    label: "An uppercase letter",
    test: (value) => /\p{Lu}/u.test(value.normalize("NFC")),
  },
  {
    id: "lowercase",
    label: "A lowercase letter",
    test: (value) => /\p{Ll}/u.test(value.normalize("NFC")),
  },
  {
    id: "digit",
    label: "A number",
    test: (value) => /\p{Nd}/u.test(value.normalize("NFC")),
  },
  {
    id: "special",
    label: "A special character or space",
    test: (value) => /[^\p{L}\p{M}\p{N}]/u.test(value.normalize("NFC")),
  },
];

export function unmetPasswordRequirements(value: string): PasswordRequirement[] {
  return PASSWORD_REQUIREMENTS.filter((requirement) => !requirement.test(value));
}

export function passwordMeetsPolicy(value: string): boolean {
  return unmetPasswordRequirements(value).length === 0;
}

export const PASSWORD_SCREENING_NOTE =
  "When you submit, we also check that it is not a common or breached password.";

export const PASSWORD_SCREENING_MESSAGES = {
  common: "This password is commonly used or compromised. Choose a unique passphrase.",
  breached: "This password appeared in a breach. Choose a unique passphrase.",
} as const;

export function isPasswordScreeningMessage(message: string): boolean {
  return (Object.values(PASSWORD_SCREENING_MESSAGES) as string[]).includes(message);
}

export const newPasswordSchema = z
  .string()
  .max(256)
  .superRefine((value, ctx) => {
    const unmet = unmetPasswordRequirements(value);
    if (unmet.length)
      ctx.addIssue({
        code: "custom",
        message: `Password must include: ${unmet.map((r) => r.label.toLowerCase()).join(", ")}.`,
      });
  });
