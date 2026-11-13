import { hkdfSync, randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

/**
 * Session tokens are HS256 JWTs. The `jti` claim carries the random session secret whose SHA-256
 * is stored in the Session collection, so a valid signature alone never grants access: the
 * session must still exist, which keeps sign-out and revocation immediate.
 */
const ALGORITHM = "HS256";
const ISSUER = "alumni-tracking";
const AUDIENCE = "alumni-tracking-web";
const KEY_PURPOSE = "alumni-tracking session jwt v1";
const SESSION_SECRET_PATTERN = /^[a-f0-9]{64}$/;

let processKey: Uint8Array | undefined;

/** Signing key derived from SESSION_SECRET, separate from that secret's other uses. */
function signingKey(settings: NodeJS.ProcessEnv = process.env): Uint8Array {
  const secret = settings.SESSION_SECRET?.trim();
  if (secret && secret.length >= 32)
    return new Uint8Array(hkdfSync("sha256", secret, "", KEY_PURPOSE, 32));
  if (settings.NODE_ENV === "production")
    throw new Error("Production requires SESSION_SECRET to sign session tokens.");
  // Development and tests without a secret: valid for this process only.
  processKey ??= new Uint8Array(randomBytes(32));
  return processKey;
}

export async function signSessionToken(
  session: { secret: string; userId: string; expiresAt: Date },
  settings: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  return new SignJWT()
    .setProtectedHeader({ alg: ALGORITHM, typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(session.userId)
    .setJti(session.secret)
    .setIssuedAt()
    .setExpirationTime(Math.floor(session.expiresAt.getTime() / 1000))
    .sign(signingKey(settings));
}

/** The session secret and user from a valid token; null for anything else. */
export async function verifySessionToken(
  token: string | null | undefined,
  settings: NodeJS.ProcessEnv = process.env,
): Promise<{ secret: string; userId: string } | null> {
  if (!token) return null;
  try {
    const { payload, protectedHeader } = await jwtVerify(token, signingKey(settings), {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: AUDIENCE,
      typ: "JWT",
      requiredClaims: ["sub", "jti", "iat", "exp"],
    });
    if (protectedHeader.alg !== ALGORITHM) return null;
    if (typeof payload.jti !== "string" || !SESSION_SECRET_PATTERN.test(payload.jti)) return null;
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    return { secret: payload.jti, userId: payload.sub };
  } catch {
    return null;
  }
}
