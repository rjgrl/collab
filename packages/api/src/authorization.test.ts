import assert from "node:assert/strict";
import { it } from "node:test";
import { modelFixture } from "./services/model-test-fixture";
import type { Context } from "./context";
import { PERMISSION_KEYS } from "@Alumni-Tracking-Ss/db";
import { assertRoleScope, publicUser } from "./services/authorization";
import { rolesService } from "../../../apps/server/src/modules/roles/service";
import { publicSignupEnabled, registerUser } from "./services/session";

const actor = {
  id: "actor",
  name: "Admin",
  email: "admin@example.test",
  image: null,
  status: "active" as const,
  mfaVerified: true,
  roles: ["super_admin"],
  permissions: [...PERMISSION_KEYS],
};
const role = {
  id: "role",
  key: "custom",
  name: "Custom",
  isSystem: false,
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  rolePermissions: [],
};
function fixture(count = 1, failure = false) {
  const f = modelFixture({
    Role: [{ ...role, updatedAt: count ? role.updatedAt : new Date("2026-01-03T00:00:00.000Z") }],
  });
  if (failure) f.failWrite("RolePermission", "deleteMany", new Error("Write failed"));
  const context = {
    db: f.db,
    user: actor,
    sessionToken: "synthetic",
    ipAddress: null,
    userAgent: null,
    integrationEnv: {},
  } as Context;
  return {
    context,
    get operations() {
      return f.operations.flatMap((op) => {
        if (op.model === "Database" && op.method === "transaction") return ["transaction"];
        if (op.model === "Role" && op.method === "updateOne") return ["claim"];
        if (op.model === "RolePermission" && op.method === "deleteMany") return ["replace"];
        if (op.model === "AuditLog" && op.method === "create") return ["audit"];
        return [];
      });
    },
  };
}
const update = (context: Context, expectedUpdatedAt = role.updatedAt.toISOString()) =>
  rolesService.update(context, { id: role.id, expectedUpdatedAt, permissionIds: [] });

it("safe user projections never include password hashes", async () => {
  const { db } = modelFixture({
    User: [
      {
        id: "user",
        name: "Test",
        email: "test@example.test",
        image: null,
        status: "active",
        passwordHash: "private-hash",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });
  const projected = await publicUser(db, "user");
  assert.equal("passwordHash" in projected, false);
  assert.equal(projected.email, "test@example.test");
});

it("production registration fails closed before database access unless explicitly enabled", async () => {
  const previousMode = process.env.NODE_ENV;
  const previousSignup = process.env.ALLOW_PUBLIC_SIGNUP;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_PUBLIC_SIGNUP;
    assert.equal(publicSignupEnabled(), false);
    const db = new Proxy(
      {},
      {
        get() {
          throw new Error("Unexpected database access");
        },
      },
    ) as Context["db"];
    await assert.rejects(
      () =>
        registerUser(db, {
          firstName: "Synthetic",
          lastName: "Test",
          middleName: "",
          suffix: "",
          phoneNumber: "+639171234567",
          gender: "Female",
          email: "test@example.test",
          password: "SyntheticPassword123!",
          studentNumber: "SYN-001",
          programId: "111111111111111111111111",
        }),
      /Public registration is disabled/,
    );
    process.env.ALLOW_PUBLIC_SIGNUP = "true";
    assert.equal(publicSignupEnabled(), true);
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
    if (previousSignup === undefined) delete process.env.ALLOW_PUBLIC_SIGNUP;
    else process.env.ALLOW_PUBLIC_SIGNUP = previousSignup;
  }
});
it("rejects permission escalation and delegated system-role editing", () => {
  const delegated = { ...actor, roles: ["custom"], permissions: ["roles.write" as const] };
  assert.throws(
    () =>
      assertRoleScope(delegated, [
        {
          key: "staff",
          isSystem: false,
          rolePermissions: [{ permission: { key: "users.write" } }],
        },
      ]),
    /beyond your own/,
  );
  assert.throws(
    () => assertRoleScope(delegated, [{ key: "viewer", isSystem: true, rolePermissions: [] }]),
    /system roles/,
  );
});
it("claims the expected role version before replacing permissions and auditing in a transaction", async () => {
  const f = fixture();
  const result = await update(f.context);
  assert.equal(result.id, role.id);
  assert.deepEqual(f.operations, ["transaction", "claim", "replace", "audit"]);
});
it("rejects stale saves before any permission assignments are deleted", async () => {
  const f = fixture(0);
  await assert.rejects(
    () => update(f.context),
    (error: unknown) =>
      typeof error === "object" && error !== null && "code" in error && error.code === "CONFLICT",
  );
  assert.deepEqual(f.operations, ["transaction", "claim"]);
});
it("propagates failed persistence without returning success or writing a success audit", async () => {
  const f = fixture(1, true);
  await assert.rejects(() => update(f.context), /Write failed/);
  assert.equal(f.operations.includes("audit"), false);
});
