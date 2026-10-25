import {
  getCountries,
  getCountryCallingCode,
  Metadata,
  parsePhoneNumberFromString,
} from "libphonenumber-js/min";
import { z } from "zod";

export function normalizePhoneNumber(value: string): string {
  const clean = value.trim().replace(/[\s().\-\u2010-\u2015]/g, "");
  if (!/^\+[1-9]\d+$/.test(clean)) return clean;
  const phone = parsePhoneNumberFromString(clean, { extract: false });
  if (!phone) return clean;
  const country =
    phone.country ??
    getCountries().find(
      (candidate) => getCountryCallingCode(candidate) === phone.countryCallingCode,
    );
  if (country) {
    const metadata = new Metadata();
    metadata.selectNumberingPlan(country);
    // The library types omit this documented numbering-plan accessor.
    const plan = metadata.numberingPlan as { nationalPrefix(): string | undefined } | undefined;
    const prefix = `+${phone.countryCallingCode}`;
    // Strip exactly one trunk zero even when the shortened number will fail length validation.
    if (plan?.nationalPrefix() === "0" && clean.startsWith(`${prefix}0`))
      return prefix + clean.slice(prefix.length + 1);
  }
  return phone.number;
}

export const phoneNumberSchema = z
  .string()
  .trim()
  .max(64)
  .transform(normalizePhoneNumber)
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, "Use a phone number with its country code."))
  .refine((value) => {
    const phone = parsePhoneNumberFromString(value, { extract: false });
    return phone?.number === value && phone.isPossible();
  }, "Enter a possible phone number for the selected country.");
