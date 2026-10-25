import assert from "node:assert/strict";
import { it, type TestContext } from "node:test";
import { requireAccess } from "../access";
import { modelFixture } from "./model-test-fixture";
import type { AuthUser, Context } from "../context";
import { requiresMfa } from "./mfa-policy";
import { loadAuthUser } from "./session";
import { mfaStatus } from "./mfa";

function localTesting(t: TestContext) {
  for (const [key, value] of Object.entries({
    NODE_ENV: "development",
    LOCAL_DISABLE_MFA: "true",
    DATABASE_URL: "mongodb://127.0.0.1:27018/collab_mfa_policy?replicaSet=rs0",
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

it("pauses Admin MFA only for explicit managed local development", () => {
  for (const NODE_ENV of [undefined, "test", "staging", "production"]) {
    assert.equal(requiresMfa(admin, { NODE_ENV, LOCAL_DISABLE_MFA: "true" }), true);
  }
  for (const LOCAL_DISABLE_MFA of [undefined, "false", "TRUE", "1"])
    assert.equal(requiresMfa(admin, { NODE_ENV: "development", LOCAL_DISABLE_MFA }), true);
  assert.equal(
    requiresMfa(admin, {
      NODE_ENV: "development",
      LOCAL_DISABLE_MFA: "true",
      DATABASE_URL: "mongodb://127.0.0.1:27018/collab_test?replicaSet=rs0",
    }),
    false,
  );
  assert.equal(
    requiresMfa(admin, {
      NODE_ENV: "development",
      LOCAL_DISABLE_MFA: "true",
      DATABASE_URL: "mongodb://remote.example.test/db",
    }),
    true,
  );
  assert.equal(
    requiresMfa(
      { roles: ["viewer"], permissions: [], mfaEnrolled: true },
      { NODE_ENV: "development", LOCAL_DISABLE_MFA: "true" },
    ),
    false,
  );
});

it("allows local Admin access without enrollment while retaining all other gates", async (t) => {
  localTesting(t);
  const procedure = (context: Context) => {
    requireAccess(context, "dashboard.read");
    return "allowed";
  };
  const context = { user: admin, integrationEnv: {} } as Context;
  assert.equal(procedure(context), "allowed");
  context.user = { ...admin, mfaVerified: true };
  assert.equal(procedure(context), "allowed");
  for (const user of [
    null,
    { ...admin, status: "disabled" as const },
    { ...admin, needsProfileCompletion: true },
    { ...admin, permissions: [] },
  ]) {
    await assert.rejects(async () => procedure({ ...context, user }));
  }
  context.user = admin;
  process.env.LOCAL_DISABLE_MFA = "false";
  await assert.rejects(async () => procedure(context), /authenticator/);
});

it("returns matching frontend/status flags without deleting enrollment or inventing MFA proof", async (t) => {
  localTesting(t);
  const credential = { secretCipher: "synthetic-encrypted-secret", version: "saved-version" };
  const { db } = modelFixture({
    User: [{ ...admin, passwordHash: "synthetic" }],
    MfaCredential: [{ userId: admin.id, ...credential }],
    UserRole: [{ userId: admin.id, roleId: "role" }],
    Role: [{ id: "role", key: "super_admin" }],
    RolePermission: [{ roleId: "role", permissionId: "p" }],
    Permission: [{ id: "p", key: "dashboard.read" }],
  });
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

it("never gates Staff or Alumni with old enrollment or stale required flags, but gates mixed Administrator roles", () => {
  for (const roles of [["staff"], ["viewer"], ["alumni"], ["viewer", "staff"]]) {
    assert.equal(
      requiresMfa(
        { roles, permissions: ["users.write"], mfaEnrolled: true, mfaRequired: true },
        { NODE_ENV: "production" },
      ),
      false,
    );
  }
  for (const roles of [["admin"], ["super_admin"], ["viewer", "admin"], ["staff", "super_admin"]]) {
    assert.equal(
      requiresMfa({ roles, permissions: [], mfaEnrolled: false }, { NODE_ENV: "production" }),
      true,
    );
  }
});
