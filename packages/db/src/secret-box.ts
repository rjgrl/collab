import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM sealing for small secrets stored in MongoDB (integration credentials).
 * The key lives only in the server environment; documents keep the ciphertext, a random
 * 96-bit IV, the auth tag and a non-reversible key fingerprint. The AAD binds each value to
 * one purpose and field, so a ciphertext cannot be moved to another integration or field.
 */
export type SealedValue = { v: 1; iv: string; tag: string; data: string };

const KEY_PATTERN = /^[a-f0-9]{64}$/i;

/** Parses a 64-hex-character (256-bit) key; throws a message that never echoes the value. */
export function parseSecretKey(hex: string | undefined, name: string): Buffer {
  if (!hex || !KEY_PATTERN.test(hex)) throw new Error(`${name} must be 64 hexadecimal characters.`);
  return Buffer.from(hex, "hex");
}

/** First 8 hex characters of SHA-256(key): identifies a key without revealing it. */
export function keyFingerprint(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

export function seal(key: Buffer, aad: string, plaintext: string): SealedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

/** Throws when the key, AAD, IV, tag or ciphertext do not match (tampering or wrong key). */
export function open(key: Buffer, aad: string, sealed: SealedValue): string {
  if (sealed?.v !== 1) throw new Error("Unsupported sealed value version.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64"));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** AAD for an integration credential field. */
export function credentialAad(integration: string, field: string) {
  return `integration:${integration}:${field}`;
}
