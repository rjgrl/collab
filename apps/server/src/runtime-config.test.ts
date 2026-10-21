import assert from "node:assert/strict";
import { it } from "node:test";
import {
  validateRuntimeConfig,
  resolveClientAddress,
  trustedProxyAddresses,
} from "./runtime-config";
const syntheticDatabaseUrl = (scheme: string, query: string) => {
  const value = new URL(`${scheme}://db.example.test/test?${query}`);
  value.username = "synthetic";
  value.password = "SECRET";
  return value.toString();
};
const valid = {
  nodeEnv: "production",
  origin: "https://app.example.test",
  appUrl: "https://api.example.test",
  databaseUrl: syntheticDatabaseUrl("mongodb", "tls=true"),
  verificationSecret: "synthetic-local-only-".repeat(3),
  mfaEncryptionKey: "14".repeat(32),
  uploadDir: process.platform === "win32" ? "C:/synthetic/uploads" : "/synthetic/uploads",
};
it("accepts explicit safe runtime settings without connecting to providers", () => {
  assert.deepEqual(validateRuntimeConfig(valid, {}), { trustedProxyIps: [] });
});
it("refuses the local authenticator bypass outside explicit development", () => {
  for (const nodeEnv of ["production", "staging", "preview", "test", "unknown"])
    assert.throws(
      () => validateRuntimeConfig({ ...valid, nodeEnv }, { LOCAL_DISABLE_MFA: "true" }),
      /development-only/,
    );
});
it("rejects production URL credential/path/query ambiguities and missing keys", () => {
  for (const origin of [
    "http://app.example.test",
    "https://app.example.test/path",
    "https://user:password@app.example.test",
    "https://app.example.test?debug=true",
    "https://app.example.test/",
  ])
    assert.throws(() => validateRuntimeConfig({ ...valid, origin }, {}), /exact HTTPS/);
  assert.throws(
    () => validateRuntimeConfig({ ...valid, mfaEncryptionKey: "" }, {}),
    /requires valid/,
  );
  assert.throws(() => validateRuntimeConfig({ ...valid, uploadDir: "./uploads" }, {}), /absolute/);
});
it("rejects insecure production database/limiter configuration without echoing values", () => {
  for (const databaseUrl of [
    "mongodb://127.0.0.1/test",
    syntheticDatabaseUrl("mongodb", "tls=false"),
    syntheticDatabaseUrl("mongodb+srv", "tlsInsecure=true"),
    syntheticDatabaseUrl("mongodb", "tls=true&tls=false"),
    syntheticDatabaseUrl("mongodb", "tls=true&TLS=false"),
  ]) {
    assert.throws(
      () => validateRuntimeConfig({ ...valid, databaseUrl }, {}),
      (error) =>
        error instanceof Error &&
        !error.message.includes("SECRET") &&
        error.message.includes("verified TLS"),
    );
  }
  assert.throws(() => validateRuntimeConfig(valid, { AUTH_IP_STORE: "memory" }), /MongoDB/);
  assert.throws(() => validateRuntimeConfig(valid, { SESSION_IDLE_MINUTES: "invalid" }));
});
it("trusts only explicit peers and one overwritten forwarded IP", () => {
  assert.equal(resolveClientAddress("203.0.113.1", "198.51.100.2", ["127.0.0.1"]), "203.0.113.1");
  assert.equal(
    resolveClientAddress("::ffff:127.0.0.1", "198.51.100.2", ["127.0.0.1"]),
    "198.51.100.2",
  );
  for (const header of [undefined, "198.51.100.2, 203.0.113.4", "malformed"])
    assert.equal(resolveClientAddress("127.0.0.1", header, ["127.0.0.1"]), null);
  assert.throws(() => trustedProxyAddresses("0.0.0.0"));
  assert.throws(() => trustedProxyAddresses("127.0.0.0/8"));
});
