import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) {
    return false;
  }

  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const storedHash = Buffer.from(hash, "hex");
  if (storedHash.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(storedHash, derived);
}

export function createSessionToken() {
  return randomBytes(32).toString("hex");
}
