import assert from "node:assert/strict";
import { it } from "node:test";
import { PERMISSION_KEYS } from "@Alumni-Tracking-Ss/db";
import type { Context } from "../context";
import { modelFixture } from "../test-utils/model-test-fixture";
import { loadAuthUser } from "./session";
import { ACCESS_MANAGER_PERMISSIONS, assertAccessManagerRemains } from "./access-managers";
import { validatePermissionIds } from "./authorization";
import { rolesService } from "../../../../apps/server/src/modules/roles/service";
import { usersService } from "../../../../apps/server/src/modules/users/service";

const version = new Date("2026-01-01T00:00:00Z");
async function setup(second = false) {
  const f = modelFixture({
    User: [
      { _id: "a", name: "First", email: "a@buksu.edu.ph", status: "active", updatedAt: version },
      { _id: "b", name: "Second", email: "b@buksu.edu.ph", status: "active", updatedAt: version },
    ],
    Role: [
      { _id: "r", key: "super_admin", name: "Super Admin", isSystem: true, updatedAt: version },
      {
        _id: "s",
        key: "custom_admin",
        baseRole: "super_admin",
        name: "Operations",
        updatedAt: version,
      },
    ],
    Permission: PERMISSION_KEYS.map((key) => ({ _id: `p-${key}`, key })),
    RolePermission: ["r", ...(second ? ["s"] : [])].flatMap((roleId) =>
      PERMISSION_KEYS.map((key) => ({ _id: `${roleId}-${key}`, roleId, permissionId: `p-${key}` })),
    ),
    UserRole: [
      { _id: "ur-a", userId: "a", roleId: "r" },
      ...(second ? [{ _id: "ur-b", userId: "b", roleId: "s" }] : []),
    ],
  });
  const user = (await loadAuthUser(f.db, "a"))!;
  const context = {
    db: f.db,
    user: { ...user, mfaVerified: true, needsProfileCompletion: false },
    sessionToken: "session",
    ipAddress: null,
    userAgent: null,
    integrationEnv: {},
  } as Context;
  return { f, context };
}
function update(context: Context, omit: string) {
  return rolesService.update(context, {
    id: "r",
    expectedUpdatedAt: version.toISOString(),
    permissionIds: PERMISSION_KEYS.filter((key) => key !== omit).map((key) => `p-${key}`),
  });
}

it("the original Super Admin role has editable grants, not an immutable full-access tier", async () => {
  const { f, context } = await setup();
  await update(context, "reports.export");
  assert(
    !f.tables.RolePermission!.some(
      (grant) => grant.roleId === "r" && grant.permissionId === "p-reports.export",
    ),
  );
  assert.equal(f.tables.AuthThrottle![0]!.key, "rbac:access-managers");
});

it("rejects and rolls back removal of the last active access manager's permissions", async () => {
  const { f, context } = await setup();
  await assert.rejects(() => update(context, "roles.write"), /at least one active Super Admin/);
  assert(
    f.tables.RolePermission!.some(
      (grant) => grant.roleId === "r" && grant.permissionId === "p-roles.write",
    ),
  );
  assert.equal(f.tables.AuditLog?.length ?? 0, 0);
});

it("another Super Admin configuration can preserve access, without a full/limited tier", async () => {
  const { context } = await setup(true);
  context.user = {
    ...(await loadAuthUser(context.db, "b"))!,
    mfaVerified: true,
    needsProfileCompletion: false,
  };
  await update(context, "roles.write");
});

it("counts combined grants and protects ordinary roles used by Super Admin managers", async () => {
  const { f, context } = await setup();
  const management = new Set<string>(ACCESS_MANAGER_PERMISSIONS);
  f.tables.RolePermission = f.tables.RolePermission!.filter(
    (grant) => !management.has(String(grant.permissionId).slice(2)),
  );
  f.tables.Role!.push({ _id: "support", key: "support", name: "Support", updatedAt: version });
  f.tables.UserRole!.push({ _id: "ur-support", userId: "a", roleId: "support" });
  f.tables.RolePermission.push(
    ...ACCESS_MANAGER_PERMISSIONS.map((key) => ({
      _id: `support-${key}`,
      roleId: "support",
      permissionId: `p-${key}`,
    })),
  );
  await assertAccessManagerRemains(context.db);
  await assert.rejects(
    () =>
      rolesService.update(context, {
        id: "support",
        expectedUpdatedAt: version.toISOString(),
        permissionIds: [],
      }),
    /at least one active Super Admin/,
  );
  assert.equal(
    f.tables.RolePermission.filter((grant) => grant.roleId === "support").length,
    ACCESS_MANAGER_PERMISSIONS.length,
  );
});

it("Super Admin role editors may grant a catalog permission not currently selected for themselves", async () => {
  const { context } = await setup();
  context.user!.permissions = ["roles.write"];
  await validatePermissionIds(context.db, context.user!, ["p-integrations.write"]);
});

it("blocks disabling the final manager but permits disabling an administrator when another remains", async () => {
  const single = await setup();
  await assert.rejects(
    () => usersService.setStatus(single.context, { id: "a", status: "disabled" }),
    /at least one active Super Admin/,
  );
  assert.equal(single.f.tables.User![0]!.status, "active");
  const multiple = await setup(true);
  await usersService.setStatus(multiple.context, { id: "a", status: "disabled" });
  assert.equal(multiple.f.tables.User![0]!.status, "disabled");
});
