import assert from "node:assert/strict";
import { it } from "node:test";
import { PERMISSION_KEYS } from "@Alumni-Tracking-Ss/db";
import type { Context } from "../context";
import { modelFixture } from "../test-utils/model-test-fixture";
import { rolesService } from "../../../../apps/server/src/modules/roles/service";
import { loadAuthUser } from "./session";

const permissionRows = PERMISSION_KEYS.map((key) => ({ _id: `p-${key}`, id: `p-${key}`, key }));
const roleGrants = (roleId: string, keys: readonly string[]) =>
  keys.map((key) => ({ roleId, permissionId: `p-${key}` }));

function accounts() {
  return modelFixture({
    User: [
      { _id: "manager", id: "manager", name: "Manager", email: "m@x.test", status: "active" },
      { _id: "admin", id: "admin", name: "Admin", email: "a@x.test", status: "active" },
    ],
    Role: [
      { _id: "r-custom", id: "r-custom", key: "records_officer", name: "Records officer" },
      { _id: "r-super", id: "r-super", key: "super_admin", name: "Super Admin", isSystem: true },
    ],
    UserRole: [
      { userId: "manager", roleId: "r-custom" },
      { userId: "admin", roleId: "r-super" },
    ],
    Permission: permissionRows,
    // An older custom role that still stores university-wide permissions.
    RolePermission: [
      ...roleGrants("r-custom", PERMISSION_KEYS),
      ...roleGrants("r-super", PERMISSION_KEYS),
    ],
  });
}

it("honors every explicitly stored permission regardless of role name", async () => {
  const f = accounts();
  const manager = await loadAuthUser(f.db, "manager");
  assert.deepEqual([...manager!.permissions].sort(), [...PERMISSION_KEYS].sort());
  const admin = await loadAuthUser(f.db, "admin");
  for (const key of PERMISSION_KEYS) assert.ok(admin!.permissions.includes(key), key);
});

it("allows a full administrator to grant every catalog permission to a custom role", async () => {
  const f = accounts();
  const context = {
    db: f.db,
    user: {
      ...(await loadAuthUser(f.db, "admin"))!,
      mfaVerified: true,
      needsProfileCompletion: false,
    },
    sessionToken: "s",
    ipAddress: null,
    userAgent: null,
    integrationEnv: {},
  } as Context;
  const delegated = await rolesService.create(context, {
    key: "trusted_operator",
    name: "Trusted operator",
    permissionIds: PERMISSION_KEYS.map((key) => `p-${key}`),
  });
  assert.deepEqual(
    delegated.rolePermissions.map(({ permission }) => permission.key).sort(),
    [...PERMISSION_KEYS].sort(),
  );
  const ok = await rolesService.create(context, {
    key: "records_clerk",
    name: "Records clerk",
    permissionIds: ["p-alumni.read", "p-reports.export"],
  });
  assert.equal(ok.key, "records_clerk");
});
