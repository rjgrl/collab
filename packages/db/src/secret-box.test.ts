import assert from "node:assert/strict";
import { it } from "node:test";
import { credentialAad, keyFingerprint, open, parseSecretKey, seal } from "./secret-box";

const key = parseSecretKey("ab".repeat(32), "TEST_KEY");
const otherKey = parseSecretKey("cd".repeat(32), "TEST_KEY");
const aad = credentialAad("email", "apiKey");

it("round-trips a value with a fresh IV each time", () => {
  const first = seal(key, aad, "gateway-token-1234");
  const second = seal(key, aad, "gateway-token-1234");
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.data, second.data);
  assert.equal(open(key, aad, first), "gateway-token-1234");
  assert.ok(!JSON.stringify(first).includes("gateway-token-1234"));
});

it("fails on tampered ciphertext, tag or IV and with the wrong key", () => {
  const sealed = seal(key, aad, "secret value");
  const flip = (b64: string) => {
    const bytes = Buffer.from(b64, "base64");
    bytes[0] = bytes[0]! ^ 1;
    return bytes.toString("base64");
  };
  assert.throws(() => open(key, aad, { ...sealed, data: flip(sealed.data) }));
  assert.throws(() => open(key, aad, { ...sealed, tag: flip(sealed.tag) }));
  assert.throws(() => open(key, aad, { ...sealed, iv: flip(sealed.iv) }));
  assert.throws(() => open(otherKey, aad, sealed));
});

it("binds a ciphertext to its integration and field (AAD swap fails)", () => {
  const sealed = seal(key, credentialAad("recaptcha", "secretKey"), "recaptcha-secret");
  assert.throws(() => open(key, credentialAad("recaptcha", "siteKey"), sealed));
  assert.throws(() => open(key, credentialAad("google_auth", "secretKey"), sealed));
  assert.equal(open(key, credentialAad("recaptcha", "secretKey"), sealed), "recaptcha-secret");
});

it("validates key format without echoing it and fingerprints without revealing it", () => {
  assert.throws(
    () => parseSecretKey("not-a-key", "INTEGRATION_ENCRYPTION_KEY"),
    (error: Error) => {
      assert.match(error.message, /INTEGRATION_ENCRYPTION_KEY must be 64 hexadecimal/);
      assert.ok(!error.message.includes("not-a-key"));
      return true;
    },
  );
  assert.throws(() => parseSecretKey(undefined, "K"));
  assert.match(keyFingerprint(key), /^[a-f0-9]{8}$/);
  assert.notEqual(keyFingerprint(key), keyFingerprint(otherKey));
  assert.ok(!"ab".repeat(32).includes(keyFingerprint(key)));
});
