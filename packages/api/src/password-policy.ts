import { z } from "zod";
export const PASSWORD_GUIDANCE =
  "Use 15–128 characters. Spaces and Unicode are welcome. Avoid common or breached passwords; a unique passphrase works well.";
export const newPasswordSchema = z
  .string()
  .max(256)
  .refine((value) => {
    const length = Array.from(value.normalize("NFC")).length;
    return length >= 15 && length <= 128;
  }, "Use a password of 15–128 characters.");
