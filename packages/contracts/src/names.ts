import { z } from "zod";

const requiredName = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value), "Names cannot contain control characters.");
const optionalName = z
  .string()
  .trim()
  .max(80)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value), "Names cannot contain control characters.")
  .optional()
  .default("");

export const structuredNameSchema = z.object({
  firstName: requiredName,
  middleName: optionalName,
  lastName: requiredName,
  suffix: z
    .string()
    .trim()
    .max(30)
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value), "Suffix cannot contain control characters.")
    .optional()
    .default(""),
});

export type StructuredName = z.infer<typeof structuredNameSchema>;

export function formatDisplayName(
  value: Partial<{ [K in keyof StructuredName]: string | null }> & { name?: string | null },
) {
  if (!value.firstName?.trim() || !value.lastName?.trim()) return value.name?.trim() ?? "";
  return [value.firstName, value.middleName, value.lastName, value.suffix]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
}

export function isAdministrator(user: { roles: readonly string[] }) {
  return user.roles.some((role) => role === "super_admin" || role === "admin");
}

export function isAlumniAccount(user: { roles: readonly string[] }) {
  return (
    user.roles.some((role) => role === "viewer" || role === "alumni") &&
    !isAdministrator(user) &&
    !user.roles.includes("staff")
  );
}
