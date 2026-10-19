import assert from "node:assert/strict";
import { it } from "node:test";
import { scryptSync } from "node:crypto";
import { hashPassword, verifyPassword } from "./password";
it("uses unique versioned hashes, Unicode normalization and legacy verification", async () => {
  const password = "A long cafe\u0301 passphrase 42";
  const a = await hashPassword(password);
  const b = await hashPassword(password);
  assert.notEqual(a, b);
  assert.match(a, /^scrypt\$v1\$/);
  assert.equal(await verifyPassword(password.normalize("NFC"), a), true);
  assert.equal(await verifyPassword("wrong", a), false);
  const salt = "12".repeat(16);
  const legacy = `${salt}:${scryptSync("LegacyPassword123!", salt, 64).toString("hex")}`;
  assert.equal(await verifyPassword("LegacyPassword123!", legacy), true);
  assert.equal(await verifyPassword("LegacyPassword123!", `${legacy}:extra`), false);
  assert.equal(await verifyPassword("test", "scrypt$v2$bad$bad"), false);
});
