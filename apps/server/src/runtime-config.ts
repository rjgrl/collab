import { isIP } from "node:net";
import path from "node:path";
import { boundedSetting } from "@Alumni-Tracking-Ss/api/services/throttle";
import { localMfaDisabled } from "@Alumni-Tracking-Ss/api/services/mfa-policy";
import { contactVerificationPolicy } from "@Alumni-Tracking-Ss/api/services/contact-policy";

export const normalizeIp = (value: string) =>
  value.startsWith("::ffff:") && isIP(value.slice(7)) === 4 ? value.slice(7) : value;
export function trustedProxyAddresses(value: string | undefined) {
  if (!value) return [];
  const addresses = value.split(",").map((x) => normalizeIp(x.trim()));
  if (addresses.some((x) => !isIP(x) || x === "0.0.0.0" || x === "::"))
    throw Error("TRUSTED_PROXY_IPS must contain explicit proxy IP addresses.");
  return [...new Set(addresses)];
}
export function resolveClientAddress(
  peer: string | null,
  forwarded: string | undefined,
  trusted: readonly string[],
) {
  if (!peer) return null;
  const normalized = normalizeIp(peer);
  if (!trusted.includes(normalized)) return normalized;
  // The trusted edge must overwrite X-Forwarded-For with one client address.
  // Missing/chained/malformed headers share the fail-closed unknown budget.
  return forwarded && isIP(forwarded.trim()) ? normalizeIp(forwarded.trim()) : null;
}
export function validateRuntimeConfig(
  input: {
    nodeEnv: string;
    origin: string;
    appUrl: string | undefined;
    databaseUrl: string;
    verificationSecret: string | undefined;
    mfaEncryptionKey: string | undefined;
    uploadDir: string | undefined;
  },
  settings: NodeJS.ProcessEnv = process.env,
) {
  contactVerificationPolicy({
    ...settings,
    NODE_ENV: input.nodeEnv,
    DATABASE_URL: input.databaseUrl,
  });
  const trustedProxyIps = trustedProxyAddresses(settings.TRUSTED_PROXY_IPS);
  boundedSetting(settings.AUTH_IP_LIMIT, 30, 1000);
  boundedSetting(settings.AUTH_IP_WINDOW_SECONDS, 900, 86400);
  boundedSetting(settings.AUTH_ACCOUNT_LIMIT, 5, 100);
  boundedSetting(settings.SESSION_IDLE_MINUTES, 30, 1440);
  if (
    settings.LOCAL_DISABLE_MFA === "true" &&
    !localMfaDisabled({ ...settings, NODE_ENV: input.nodeEnv, DATABASE_URL: input.databaseUrl })
  )
    throw Error(
      "LOCAL_DISABLE_MFA is development-only and requires managed loopback MongoDB. Remove it before production.",
    );
  if (input.nodeEnv !== "production") return { trustedProxyIps };
  for (const value of [input.origin, input.appUrl]) {
    let url: URL;
    try {
      url = new URL(value ?? "");
    } catch {
      throw Error("Production URLs must be exact HTTPS origins.");
    }
    if (url.protocol !== "https:" || url.origin !== value || url.username || url.password)
      throw Error("Production URLs must be exact HTTPS origins.");
  }
  if (
    !/^[a-f0-9]{64}$/i.test(input.mfaEncryptionKey ?? "") ||
    (input.verificationSecret?.trim().length ?? 0) < 32
  )
    throw Error("Production requires valid MFA_ENCRYPTION_KEY and SESSION_SECRET.");
  if (!input.uploadDir || !path.isAbsolute(input.uploadDir))
    throw Error("Production UPLOAD_DIR must be an absolute persistent directory.");
  if (settings.AUTH_IP_STORE && settings.AUTH_IP_STORE !== "mongodb")
    throw Error("Production authentication budgets require MongoDB storage.");
  const match = input.databaseUrl.match(/^(mongodb(?:\+srv)?):\/\/([^/?#]+)(?:\/|\?|$)/);
  const auth = match?.[2]?.split("@");
  const query = new URLSearchParams(input.databaseUrl.split("?")[1] ?? "");
  const security = new Map<string, string[]>();
  for (const [key, value] of query) {
    const name = key.toLowerCase();
    security.set(name, [...(security.get(name) ?? []), value]);
  }
  if (
    !match ||
    auth?.length !== 2 ||
    !/^([^:]+):(.+)$/.test(auth[0]!) ||
    input.databaseUrl.includes("#") ||
    (match[1] === "mongodb" && !["true"].includes(query.get("tls") ?? query.get("ssl") ?? "")) ||
    ["tls", "ssl"].some(
      (key) =>
        security.has(key) && (security.get(key)!.length !== 1 || security.get(key)![0] !== "true"),
    ) ||
    ["tlsAllowInvalidCertificates", "tlsAllowInvalidHostnames", "tlsInsecure"].some(
      (key) =>
        security.has(key.toLowerCase()) &&
        (security.get(key.toLowerCase())!.length !== 1 ||
          security.get(key.toLowerCase())![0] !== "false"),
    )
  )
    throw Error("Production DATABASE_URL requires credentials and verified TLS.");
  return { trustedProxyIps };
}
