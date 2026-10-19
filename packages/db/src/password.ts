import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const KEY_LENGTH = 64;
const COST = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
let active = 0;
const waiting: Array<() => void> = [];
async function derive(password: string, salt: string, modern: boolean) {
  // Bound memory use: at most two expensive scrypt operations per process.
  if (active >= 2) {
    if (waiting.length >= 30) throw new Error("Password processing is busy. Try again shortly.");
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else active++;
  try {
    return await new Promise<Buffer>((resolve, reject) =>
      scrypt(password, salt, KEY_LENGTH, modern ? COST : {}, (error, key) =>
        error ? reject(error) : resolve(key),
      ),
    );
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await derive(password.normalize("NFC"), salt, true);
  return `scrypt$v1$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const modern = stored.startsWith("scrypt$v1$");
  const parts = modern ? stored.split("$").slice(2) : stored.split(":");
  const [salt, hash] = parts;
  if (
    parts.length !== 2 ||
    !salt ||
    !hash ||
    !/^[a-f0-9]{32}$/.test(salt) ||
    !/^[a-f0-9]{128}$/.test(hash)
  ) {
    return false;
  }

  const derived = await derive(modern ? password.normalize("NFC") : password, salt, modern);
  const storedHash = Buffer.from(hash, "hex");
  if (storedHash.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(storedHash, derived);
}

export function createSessionToken() {
  return randomBytes(32).toString("hex");
}
