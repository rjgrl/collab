import assert from "node:assert/strict";
import { it } from "node:test";
import { accountAccessPending } from "./verification";
import { validateRuntimeConfig } from "../../../../apps/server/src/runtime-config";

const unverified = {
  passwordHash: "existing-hash",
  verificationRequired: true,
  emailVerified: false,
  phoneVerified: false,
};
it("local contact exemptions preserve truth and reapply on a strict-policy restart", (t) => {
  const original = { ...process.env };
  t.after(() => {
    process.env = original;
  });
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "mongodb://127.0.0.1:27018/collab_policy_test?replicaSet=rs0";
  process.env.LOCAL_REQUIRE_EMAIL_VERIFICATION = "false";
  process.env.LOCAL_REQUIRE_PHONE_VERIFICATION = "false";
  assert.equal(accountAccessPending(unverified), false);
  assert.equal(unverified.emailVerified, false);
  assert.equal(unverified.phoneVerified, false);
  assert.equal(accountAccessPending({ ...unverified, needsProfileCompletion: true }), true);
  assert.equal(accountAccessPending({ ...unverified, passwordHash: null }), true);
  process.env.LOCAL_REQUIRE_EMAIL_VERIFICATION = "true";
  assert.equal(accountAccessPending(unverified), true);
  assert.equal(accountAccessPending({ ...unverified, emailVerified: true }), false);
  process.env.LOCAL_REQUIRE_PHONE_VERIFICATION = "true";
  assert.equal(accountAccessPending({ ...unverified, emailVerified: true }), true);
});
it("contact bypass cannot be applied to production or a remote development database", (t) => {
  const original = { ...process.env };
  t.after(() => {
    process.env = original;
  });
  process.env.LOCAL_REQUIRE_EMAIL_VERIFICATION = "false";
  process.env.LOCAL_REQUIRE_PHONE_VERIFICATION = "false";
  process.env.NODE_ENV = "production";
  assert.throws(() => accountAccessPending(unverified), /development-only/);
  assert.throws(
    () =>
      validateRuntimeConfig(
        {
          nodeEnv: "production",
          origin: "",
          databaseUrl: "",
          appUrl: undefined,
          verificationSecret: undefined,
          mfaEncryptionKey: undefined,
          uploadDir: undefined,
        },
        process.env,
      ),
    /development-only/,
  );
  process.env.NODE_ENV = "development";
  process.env.DATABASE_URL = "mongodb://remote.example.test/alumni";
  assert.throws(() => accountAccessPending(unverified), /managed loopback/);
  for (const target of [
    "mongodb://127.0.0.1:27018/?replicaSet=rs0",
    "mongodb://127.0.0.1:27018/test?replicaSet=rs0&directConnection=true",
    "mongodb://127.0.0.1:27018/test?replicaSet=rs0&replicaSet=remote",
  ]) {
    process.env.DATABASE_URL = target;
    assert.throws(() => accountAccessPending(unverified), /managed loopback/);
  }
});
