import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createDatabase, PERMISSION_KEYS, PERMISSIONS } from "@Alumni-Tracking-Ss/db";
import { migrateDatabase } from "@Alumni-Tracking-Ss/db/migration";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { loadAuthUser } from "@Alumni-Tracking-Ss/api/services/session";
import { rolesService } from "../../src/modules/roles/service";
import {
  lockAccessManagers,
  assertAccessManagerRemains,
} from "@Alumni-Tracking-Ss/api/services/access-managers";

if (process.env.NODE_ENV === "production") throw new Error("Disposable local acceptance only.");
process.env.NODE_ENV = "test";
const name = `collab_access_managers_${randomBytes(8).toString("hex")}`;
const url = `mongodb://127.0.0.1:27018/${name}?replicaSet=rs0`;
const db = createDatabase({ DATABASE_URL: url });
const peer = createDatabase({ DATABASE_URL: url });
try {
  assert.deepEqual((await migrateDatabase(db, "apply")).conflicts, []);
  await peer.ready();
  await db.Permission.insertMany(PERMISSIONS);
  const original = (
    await db.Role.create({ key: "super_admin", name: "Super Admin", isSystem: true })
  ).toObject();
  const custom = await db.Role.create({
    key: "custom_admin",
    baseRole: "super_admin",
    name: "Operations",
  });
  const permissions = await db.Permission.find({ key: { $in: PERMISSION_KEYS } }).lean();
  assert.equal(permissions.length, PERMISSION_KEYS.length);
  await db.RolePermission.deleteMany({ roleId: { $in: [original._id, custom._id] } });
  await db.RolePermission.insertMany(
    [original._id, custom._id].flatMap((roleId) =>
      permissions.map((permission) => ({ roleId, permissionId: permission._id })),
    ),
  );
  const users = await db.User.create([
    { name: "Synthetic One", email: "access-one@buksu.edu.ph", status: "active" },
    { name: "Synthetic Two", email: "access-two@buksu.edu.ph", status: "active" },
  ]);
  const roles = [original, custom.toObject()];
  await db.UserRole.insertMany(
    users.map((user, index) => ({ userId: user._id, roleId: roles[index]!._id })),
  );
  const contexts = await Promise.all(
    users.map(
      async (user, index) =>
        ({
          db: index ? peer : db,
          user: {
            ...(await loadAuthUser(db, String(user._id)))!,
            mfaVerified: true,
            needsProfileCompletion: false,
          },
          sessionToken: "synthetic",
          ipAddress: null,
          userAgent: null,
          integrationEnv: {},
        }) as Context,
    ),
  );
  // Both transactions would pass a naive read-only "another manager exists" check.
  const results = await Promise.allSettled(
    contexts.map((context, index) =>
      rolesService.update(context, {
        id: String(roles[index]!._id),
        expectedUpdatedAt: roles[index]!.updatedAt.toISOString(),
        permissionIds: permissions
          .filter((permission) => permission.key !== "roles.write")
          .map((permission) => String(permission._id)),
      }),
    ),
  );
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const managers = await Promise.all(users.map((user) => loadAuthUser(db, String(user._id))));
  assert.equal(managers.filter((user) => user?.permissions.includes("roles.write")).length, 1);
  assert.equal(await db.AuditLog.countDocuments({ action: "roles.update" }), 1);
  assert.equal(await db.AuthThrottle.countDocuments({ key: "rbac:access-managers" }), 1);
  const writePermission = permissions.find((permission) => permission.key === "roles.write")!;
  for (const role of roles)
    await db.RolePermission.updateOne(
      { roleId: role._id, permissionId: writePermission._id },
      { $setOnInsert: { roleId: role._id, permissionId: writePermission._id } },
      { upsert: true },
    );
  let release!: () => void;
  const bothRead = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrivals = 0;
  const synchronized = await Promise.allSettled(
    [db, peer].map((client, index) =>
      client.transaction(async (tx) => {
        await tx.Role.findById(roles[index]!._id).lean();
        if (++arrivals === 2) release();
        await bothRead;
        await lockAccessManagers(tx);
        await tx.RolePermission.deleteOne({
          roleId: roles[index]!._id,
          permissionId: writePermission._id,
        });
        await assertAccessManagerRemains(tx);
      }),
    ),
  );
  assert.equal(synchronized.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(await db.RolePermission.countDocuments({ permissionId: writePermission._id }), 1);
  console.log(
    "PASS API saves and synchronized independent transaction snapshots cannot remove all access managers; rejected data and audit roll back.",
  );
} finally {
  await peer.disconnect();
  if (db.connection.db?.databaseName === name) await db.connection.dropDatabase();
  await db.disconnect();
}
