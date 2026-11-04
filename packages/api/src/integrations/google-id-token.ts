import { createPublicKey, verify, type JsonWebKeyInput, type KeyObject } from "node:crypto";
import { z } from "zod";

// Hard-coded per https://developers.google.com/identity/openid-connect/openid-connect ("Discovery document").
const DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const CLOCK_SKEW_SECONDS = 60;

export const googleIdClaimsSchema = z.object({
  iss: z.string(),
  aud: z.string(),
  sub: z.string().min(1),
  exp: z.number(),
  iat: z.number(),
  email: z.string().email(),
  email_verified: z.literal(true),
  hd: z.string().optional(),
  name: z.string().optional(),
  picture: z.string().url().optional(),
});
export type GoogleIdClaims = z.infer<typeof googleIdClaimsSchema>;

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
let cache: { keys: Map<string, KeyObject>; expiresAt: number } | null = null;

export function resetGoogleKeyCache() {
  cache = null;
}

function maxAgeMs(response: Response) {
  const match = /max-age=(\d+)/.exec(response.headers.get("cache-control") ?? "");
  return Math.min(Number(match?.[1] ?? 3600), 86_400) * 1000;
}

async function signingKeys(fetcher: Fetch, now: number) {
  if (cache && cache.expiresAt > now) return cache.keys;
  const discovery = await fetcher(DISCOVERY_URL, { signal: AbortSignal.timeout(10_000) });
  if (!discovery.ok) throw new Error("Google discovery document unavailable");
  const { jwks_uri } = z.object({ jwks_uri: z.string().url() }).parse(await discovery.json());
  if (new URL(jwks_uri).protocol !== "https:") throw new Error("Google JWKS must use HTTPS");
  const response = await fetcher(jwks_uri, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("Google signing keys unavailable");
  const { keys } = z
    .object({ keys: z.array(z.object({ kid: z.string(), kty: z.literal("RSA") }).passthrough()) })
    .parse(await response.json());
  cache = {
    keys: new Map(
      keys.map((jwk) => [jwk.kid, createPublicKey({ key: jwk, format: "jwk" } as JsonWebKeyInput)]),
    ),
    expiresAt: now + maxAgeMs(response),
  };
  return cache.keys;
}

function decodePart(part: string) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as unknown;
}

/**
 * Verifies a Google ID token's RS256 signature against Google's published keys, then its
 * issuer, audience and lifetime. Throws on any failure; callers must treat that as sign-in failure.
 */
export async function verifyGoogleIdToken(
  token: string,
  clientId: string,
  options: { fetch?: Fetch; now?: number } = {},
): Promise<GoogleIdClaims> {
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now();
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed ID token");
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const header = z
    .object({ alg: z.literal("RS256"), kid: z.string() })
    .parse(decodePart(headerPart));
  let key = (await signingKeys(fetcher, now)).get(header.kid);
  if (!key) {
    // Google rotates keys; refetch once before rejecting an unknown key id.
    cache = null;
    key = (await signingKeys(fetcher, now)).get(header.kid);
  }
  if (!key) throw new Error("Unknown ID token signing key");
  const signed = verify(
    "RSA-SHA256",
    Buffer.from(`${headerPart}.${payloadPart}`),
    key,
    Buffer.from(signaturePart, "base64url"),
  );
  if (!signed) throw new Error("Invalid ID token signature");
  const claims = googleIdClaimsSchema.parse(decodePart(payloadPart));
  const seconds = now / 1000;
  if (!ISSUERS.has(claims.iss)) throw new Error("Unexpected ID token issuer");
  if (claims.aud !== clientId) throw new Error("ID token audience mismatch");
  if (claims.exp + CLOCK_SKEW_SECONDS < seconds) throw new Error("ID token expired");
  if (claims.iat - CLOCK_SKEW_SECONDS > seconds) throw new Error("ID token issued in the future");
  return claims;
}
