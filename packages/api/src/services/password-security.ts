import { createHash } from "node:crypto";
import { dictionary } from "@zxcvbn-ts/language-common";
import { ApiError } from "../http-error";
import {
  newPasswordSchema,
  PASSWORD_SCREENING_MESSAGES,
} from "@Alumni-Tracking-Ss/contracts/password-policy";
const common = new Set(dictionary["passwords-common"].map((value) => value.toLowerCase()));
export async function assertPasswordSafe(password: string) {
  if (common.has(password.normalize("NFC").toLowerCase()))
    throw new ApiError("BAD_REQUEST", { message: PASSWORD_SCREENING_MESSAGES.common });
  newPasswordSchema.parse(password);
  // Explicit opt-in only. Five SHA-1 prefix characters, never plaintext/full hash.
  if (process.env.PASSWORD_BREACH_CHECK !== "hibp") return;
  const hash = createHash("sha1").update(password.normalize("NFC")).digest("hex").toUpperCase();
  let response;
  try {
    response = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new ApiError("SERVICE_UNAVAILABLE", {
      message: "Password screening is temporarily unavailable. Try again later.",
    });
  }
  if (!response.ok)
    throw new ApiError("SERVICE_UNAVAILABLE", {
      message: "Password screening is temporarily unavailable. Try again later.",
    });
  if (
    (await response.text()).split(/\r?\n/).some((line) => {
      const [suffix, count] = line.split(":");
      return suffix === hash.slice(5) && Number(count) > 0;
    })
  )
    throw new ApiError("BAD_REQUEST", { message: PASSWORD_SCREENING_MESSAGES.breached });
}
