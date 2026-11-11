import assert from "node:assert/strict";
import { it } from "node:test";
import {
  PASSWORD_SCREENING_MESSAGES,
  isPasswordScreeningMessage,
  newPasswordSchema,
  passwordLength,
  passwordMeetsPolicy,
  unmetPasswordRequirements,
} from "./password-policy";

const ok = (value: string) => newPasswordSchema.safeParse(value).success;

it("enforces the 15 and 128 character boundaries", () => {
  assert.equal(ok("Aa1!" + "x".repeat(10)), false); // 14
  assert.equal(ok("Aa1!" + "x".repeat(11)), true); // 15
  assert.equal(ok("Aa1!" + "x".repeat(124)), true); // 128
  assert.equal(ok("Aa1!" + "x".repeat(125)), false); // 129
});

it("counts code points after NFC normalization", () => {
  const fifteen = "Aa1!" + "e\u0301".repeat(11); // 26 UTF-16 units, 15 code points after NFC
  assert.equal(passwordLength(fifteen), 15);
  assert.equal(ok(fifteen), true);
  const fourteen = "Aa1!" + "e\u0301".repeat(10); // 24 UTF-16 units, 14 code points after NFC
  assert.equal(passwordLength(fourteen), 14);
  assert.equal(ok(fourteen), false);
});

it("counts astral characters as one code point each", () => {
  assert.equal(passwordLength("Aa1" + "😀".repeat(12)), 15);
  assert.equal(ok("Aa1" + "😀".repeat(12)), true);
  assert.equal(passwordLength("Aa1!" + "😀".repeat(124)), 128);
  assert.equal(ok("Aa1!" + "😀".repeat(124)), true);
  assert.equal(passwordLength("Aa1!" + "😀".repeat(125)), 129);
  assert.equal(ok("Aa1!" + "😀".repeat(125)), false);
});

it("requires each character type", () => {
  assert.equal(ok("a quiet river carries 7 boats"), false); // no uppercase
  assert.equal(ok("A QUIET RIVER CARRIES 7 BOATS"), false); // no lowercase
  assert.equal(ok("A quiet river carries seven boats"), false); // no number
  assert.equal(ok("AquietRiverCarries7Boats"), false); // no special character
  assert.equal(ok("A quiet river carries 7 boats"), true);
});

it("accepts non-ASCII letters and counts a space as a special character", () => {
  assert.equal(ok("Ñandú grande 2024 río"), true);
  assert.deepEqual(
    unmetPasswordRequirements("Aquietrivercarries7").map((r) => r.id),
    ["special"],
  );
  assert.equal(passwordMeetsPolicy("Aquiet river carries7"), true);
});

it("reports every requirement except the maximum length for an empty value", () => {
  assert.deepEqual(
    unmetPasswordRequirements("").map((r) => r.id),
    ["min-length", "uppercase", "lowercase", "digit", "special"],
  );
});

it("recognizes only the server screening messages", () => {
  assert.equal(isPasswordScreeningMessage(PASSWORD_SCREENING_MESSAGES.common), true);
  assert.equal(isPasswordScreeningMessage(PASSWORD_SCREENING_MESSAGES.breached), true);
  assert.equal(isPasswordScreeningMessage("Network error"), false);
});
