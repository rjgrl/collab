import assert from "node:assert/strict";
import { it } from "node:test";
import { PERMISSION_KEYS } from "@Alumni-Tracking-Ss/db";
import { SUPER_ADMIN_ONLY_PERMISSIONS } from "@Alumni-Tracking-Ss/contracts/permission-scope";
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
      ...roleGrants("r-custom", ["alumni.read", "reports.export", ...SUPER_ADMIN_ONLY_PERMISSIONS]),
      ...roleGrants("r-super", PERMISSION_KEYS),
    ],
  });
}

it("gives a custom role no university-wide permission, even one it stores", async () => {
  const f = accounts();
  const manager = await loadAuthUser(f.db, "manager");
  assert.deepEqual([...manager!.permissions].sort(), ["alumni.read", "reports.export"]);
  const admin = await loadAuthUser(f.db, "admin");
  for (const key of SUPER_ADMIN_ONLY_PERMISSIONS) assert.ok(admin!.permissions.includes(key), key);
});

it("refuses to give any role a university-wide permission", async () => {
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
  for (const key of SUPER_ADMIN_ONLY_PERMISSIONS)
    await assert.rejects(
      () =>
        rolesService.create(context, {
          key: "sneaky",
          name: "Sneaky",
          permissionIds: [`p-${key}`],
        }),
      /Super Admins only/,
      key,
    );
  const ok = await rolesService.create(context, {
    key: "records_clerk",
    name: "Records clerk",
    permissionIds: ["p-alumni.read", "p-reports.export"],
  });
  assert.equal(ok.key, "records_clerk");
});
