import assert from "node:assert/strict";
import { it } from "node:test";
import { writeAudit } from "./audit";
import { modelFixture } from "./test-utils/model-test-fixture";

it("writeAudit stores actorSnapshot.roles as sorted role names at event time", async () => {
  const userId = "u00000000000000000a0001";
  const roleAdminId = "r00000000000000000a0001";
  const roleEditorId = "r00000000000000000a0002";

  const f = modelFixture({
    Role: [
      { id: roleAdminId, _id: roleAdminId, name: "Admin", key: "admin" },
      { id: roleEditorId, _id: roleEditorId, name: "Editor", key: "editor" },
    ],
    UserRole: [
      { userId, roleId: roleAdminId },
      { userId, roleId: roleEditorId },
    ],
    AuditLog: [],
  });

  await writeAudit(f.db, {
    actor: { id: userId, name: "Test User", email: "test@example.com" },
    action: "users.update",
    entity: "user",
    entityId: userId,
    summary: "Updated user",
  });

  const created = f.tables.AuditLog?.[0];
  assert(created, "AuditLog entry should be created");
  assert.deepEqual((created as Record<string, unknown>).metadata as Record<string, unknown>, {
    actorSnapshot: {
      id: userId,
      name: "Test User",
      email: "test@example.com",
      roles: ["Admin", "Editor"], // Sorted alphabetically
    },
  });
});

it("writeAudit with no roles stores empty roles array", async () => {
  const userId = "u00000000000000000a0002";

  const f = modelFixture({
    Role: [],
    UserRole: [],
    AuditLog: [],
  });

  await writeAudit(f.db, {
    actor: { id: userId, name: "Test User", email: "test@example.com" },
    action: "users.update",
    entity: "user",
    entityId: userId,
    summary: "Updated user",
  });

  const created = f.tables.AuditLog?.[0];
  assert(created, "AuditLog entry should be created");
  const metadata = (created as Record<string, unknown>).metadata as Record<string, unknown>;
  const actorSnapshot = metadata.actorSnapshot as Record<string, unknown>;
  assert.deepEqual(actorSnapshot.roles, []);
});

it("writeAudit with no actor does not create actorSnapshot", async () => {
  const f = modelFixture({
    AuditLog: [],
  });

  await writeAudit(f.db, {
    actorId: "u00000000000000000a0003",
    action: "system.action",
    entity: "system",
    summary: "System action",
  });

  const created = f.tables.AuditLog?.[0];
  assert(created, "AuditLog entry should be created");
  const metadata = (created as Record<string, unknown>).metadata;
  assert.equal(metadata, undefined);
});

it("changing user's roles after writeAudit does not change the stored entry", async () => {
  const userId = "u00000000000000000a0004";
  const roleAdminId = "r00000000000000000a0003";
  const roleEditorId = "r00000000000000000a0004";

  const f = modelFixture({
    Role: [
      { id: roleAdminId, _id: roleAdminId, name: "Admin", key: "admin" },
      { id: roleEditorId, _id: roleEditorId, name: "Editor", key: "editor" },
    ],
    UserRole: [{ userId, roleId: roleAdminId }],
    AuditLog: [],
  });

  // Write audit with user in Admin role
  await writeAudit(f.db, {
    actor: { id: userId, name: "Test User", email: "test@example.com" },
    action: "users.update",
    entity: "user",
    entityId: userId,
    summary: "Updated user",
  });

  const created = f.tables.AuditLog?.[0];
  const actorSnapshot = ((created as Record<string, unknown>).metadata as Record<string, unknown>)
    .actorSnapshot as Record<string, unknown>;
  assert.deepEqual(actorSnapshot.roles, ["Admin"]);

  // Simulate role change by adding Editor role
  f.tables.UserRole = [
    { userId, roleId: roleAdminId },
    { userId, roleId: roleEditorId },
  ];

  // The stored entry should still have only Admin role
  assert.deepEqual(actorSnapshot.roles, ["Admin"]);
});
