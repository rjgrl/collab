import assert from "node:assert/strict";
import { it } from "node:test";
import { call } from "@orpc/server";
import type { Context } from "./context";
import { PERMISSION_KEYS } from "@Alumni-Tracking-Ss/db";
import { assertRoleScope, publicUserSelect } from "./services/authorization";
import { rolesRouter } from "./routers/rbac";
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
  const operations: string[] = [];
  const tx = {
    role: {
      findUnique: async () => role,
      findUniqueOrThrow: async () => ({ ...role, updatedAt: new Date("2026-01-02T00:00:00.000Z") }),
      updateMany: async () => {
        operations.push("claim");
        return { count };
      },
    },
    permission: { findMany: async () => [] },
    rolePermission: {
      deleteMany: async () => {
        operations.push("replace");
        if (failure) throw new Error("Write failed");
      },
    },
    auditLog: {
      create: async () => {
        operations.push("audit");
      },
    },
  };
  const context = {
    db: {
      $transaction: async (work: (db: typeof tx) => Promise<unknown>) => {
        operations.push("transaction");
        return work(tx);
      },
    },
    user: actor,
    sessionToken: "synthetic",
    ipAddress: null,
    userAgent: null,
    integrationEnv: {},
  } as unknown as Context;
  return { context, operations };
}
const update = (context: Context, expectedUpdatedAt = role.updatedAt.toISOString()) =>
  call(rolesRouter.update, { id: role.id, expectedUpdatedAt, permissionIds: [] }, { context });

it("safe user projections never include password hashes", () => {
  assert.equal("passwordHash" in publicUserSelect, false);
  assert.equal(publicUserSelect.email, true);
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
          name: "Synthetic",
          phoneNumber: "+639171234567",
          gender: "Female",
          email: "test@example.test",
          password: "SyntheticPassword123!",
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
  const { context, operations } = fixture();
  const result = await update(context);
  assert.equal(result.id, role.id);
  assert.deepEqual(operations, ["transaction", "claim", "replace", "audit"]);
});
it("rejects stale saves before any permission assignments are deleted", async () => {
  const { context, operations } = fixture(0);
  await assert.rejects(
    () => update(context),
    (error: unknown) =>
      typeof error === "object" && error !== null && "code" in error && error.code === "CONFLICT",
  );
  assert.deepEqual(operations, ["transaction", "claim"]);
});
it("propagates failed persistence without returning success or writing a success audit", async () => {
  const { context, operations } = fixture(1, true);
  await assert.rejects(() => update(context), /Write failed/);
  assert.equal(operations.includes("audit"), false);
});
