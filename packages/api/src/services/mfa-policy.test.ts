import assert from "node:assert/strict";
import { it, type TestContext } from "node:test";
import { call } from "@orpc/server";
import type { Database } from "@Alumni-Tracking-Ss/db";
import type { AuthUser, Context } from "../context";
import { requirePermission } from "../index";
import { localMfaDisabled, requiresMfa } from "./mfa-policy";
import { loadAuthUser } from "./session";
import { mfaStatus } from "./mfa";

function localTesting(t: TestContext) {
  for (const [key, value] of Object.entries({
    NODE_ENV: "development",
    LOCAL_DISABLE_MFA: "true",
  })) {
    const prior = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (prior === undefined) delete process.env[key];
      else process.env[key] = prior;
    });
  }
}
const admin: AuthUser = {
  id: "synthetic",
  name: "Synthetic",
  email: "test@example.test",
  image: null,
  status: "active",
  roles: ["super_admin"],
  permissions: ["dashboard.read"],
  mfaRequired: true,
  mfaEnrolled: true,
  mfaVerified: false,
};

it("allows the switch only in explicit development and restores enforcement when removed", () => {
  for (const NODE_ENV of [undefined, "test", "staging", "production"]) {
    assert.equal(localMfaDisabled({ NODE_ENV, LOCAL_DISABLE_MFA: "true" }), false);
    assert.equal(requiresMfa(admin, { NODE_ENV, LOCAL_DISABLE_MFA: "true" }), true);
  }
  for (const LOCAL_DISABLE_MFA of [undefined, "false", "TRUE", "1"])
    assert.equal(requiresMfa(admin, { NODE_ENV: "development", LOCAL_DISABLE_MFA }), true);
  assert.equal(requiresMfa(admin, { NODE_ENV: "development", LOCAL_DISABLE_MFA: "true" }), false);
  assert.equal(
    requiresMfa(
      { roles: ["viewer"], permissions: [], mfaEnrolled: true },
      { NODE_ENV: "development", LOCAL_DISABLE_MFA: "true" },
    ),
    false,
  );
});

it("permits local protected procedures without MFA while keeping sign-in, status, verification and RBAC gates", async (t) => {
  localTesting(t);
  const procedure = requirePermission("dashboard.read").handler(() => "allowed");
  const context = { user: admin, integrationEnv: {} } as Context;
  assert.equal(await call(procedure, undefined, { context }), "allowed");
  for (const roles of [["super_admin"], ["staff"], ["viewer"]]) {
    // Previously enrolled accounts and administrators share the same override.
    const user = { ...admin, roles, mfaRequired: true, mfaEnrolled: true };
    assert.equal(requiresMfa(user), false);
    assert.equal(await call(procedure, undefined, { context: { ...context, user } }), "allowed");
  }
  for (const user of [
    null,
    { ...admin, status: "disabled" as const },
    { ...admin, needsProfileCompletion: true },
    { ...admin, permissions: [] },
  ]) {
    await assert.rejects(() => call(procedure, undefined, { context: { ...context, user } }));
  }
  process.env.LOCAL_DISABLE_MFA = "false";
  await assert.rejects(() => call(procedure, undefined, { context }), /authenticator/);
});

it("returns matching frontend/status flags without deleting enrollment or inventing MFA proof", async (t) => {
  localTesting(t);
  const credential = { secretCipher: "synthetic-encrypted-secret", version: "saved-version" };
  const db = {
    user: {
      findUnique: async () => ({
        ...admin,
        passwordHash: "synthetic",
        mfaCredential: credential,
        userRoles: [
          {
            role: {
              key: "super_admin",
              rolePermissions: [{ permission: { key: "dashboard.read" } }],
            },
          },
        ],
      }),
    },
    mfaCredential: { findUnique: async () => credential },
  } as unknown as Database;
  const user = await loadAuthUser(db, admin.id);
  assert.equal(user?.mfaRequired, false);
  assert.equal(user?.mfaEnrolled, true);
  assert.equal(user?.mfaVerified, false);
  assert.equal(user?.mfaVersion, "saved-version");
  const status = await mfaStatus({ db, user, integrationEnv: {} } as Context);
  assert.equal(status.required, false);
  assert.equal(status.enforcementDisabled, true);
  process.env.LOCAL_DISABLE_MFA = "false";
  assert.equal((await loadAuthUser(db, admin.id))?.mfaRequired, true);
  assert.equal(credential.secretCipher, "synthetic-encrypted-secret");
});
