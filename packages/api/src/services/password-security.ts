import { createHash } from "node:crypto";
import { dictionary } from "@zxcvbn-ts/language-common";
import { ORPCError } from "@orpc/server";
import { newPasswordSchema } from "../password-policy";
const common = new Set(dictionary["passwords-common"].map((value) => value.toLowerCase()));
export async function assertPasswordSafe(password: string) {
  newPasswordSchema.parse(password);
  if (common.has(password.normalize("NFC").toLowerCase()))
    throw new ORPCError("BAD_REQUEST", {
      message: "This password is commonly used or compromised. Choose a unique passphrase.",
    });
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
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: "Password screening is temporarily unavailable. Try again later.",
    });
  }
  if (!response.ok)
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: "Password screening is temporarily unavailable. Try again later.",
    });
  if (
    (await response.text()).split(/\r?\n/).some((line) => {
      const [suffix, count] = line.split(":");
      return suffix === hash.slice(5) && Number(count) > 0;
    })
  )
    throw new ORPCError("BAD_REQUEST", {
      message: "This password appeared in a breach. Choose a unique passphrase.",
    });
}
