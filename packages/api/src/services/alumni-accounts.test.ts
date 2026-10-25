import assert from "node:assert/strict";
import { it } from "node:test";
import { PERMISSION_KEYS } from "@Alumni-Tracking-Ss/db";
import { usersSchemas } from "@Alumni-Tracking-Ss/contracts/users";
import type { Context } from "../context";
import { usersService } from "../../../../apps/server/src/modules/users/service";
import { rolesService } from "../../../../apps/server/src/modules/roles/service";
import { alumniService } from "../../../../apps/server/src/modules/alumni/service";
import { modelFixture } from "./model-test-fixture";
import { loadAuthUser } from "./session";
import { verificationStatus } from "./verification";

const viewerId = "111111111111111111111111";
const staffId = "222222222222222222222222";
const programId = "333333333333333333333333";
const departmentId = "444444444444444444444444";
const account = {
  firstName: "Test",
  lastName: "Alumni",
  email: "new@example.test",
  password: "Synthetic alumni passphrase 123!",
};
const alumniProfile = {
  studentNumber: "SYN-NEW-001",
  programId,
  phoneNumber: "+639171234567",
  gender: "Female" as const,
  graduationYear: 2025,
};
function fixture() {
  const f = modelFixture({
    Role: [
      { id: viewerId, _id: viewerId, key: "viewer", name: "Viewer", isSystem: true },
      { id: staffId, _id: staffId, key: "staff", name: "Staff", isSystem: true },
    ],
    Program: [{ id: programId, departmentId, code: "TEST", deletedAt: null }],
    Department: [{ id: departmentId, name: "Synthetic", deletedAt: null }],
  });
  const context = {
    db: f.db,
    user: {
      id: "actor",
      name: "Admin",
      email: "admin@example.test",
      image: null,
      status: "active",
      roles: ["super_admin"],
      permissions: [...PERMISSION_KEYS],
      mfaVerified: true,
    },
    sessionToken: "synthetic",
    ipAddress: null,
    userAgent: null,
    integrationEnv: {},
  } as Context;
  return { ...f, context };
}

it("routes legacy unlinked Alumni accounts to profile completion without affecting Staff", async () => {
  for (const roleId of [viewerId, staffId]) {
    const f = fixture();
    f.tables.User = [
      {
        id: "legacy",
        ...account,
        passwordHash: "existing-hash",
        status: "active",
        needsProfileCompletion: false,
      },
    ];
    f.tables.UserRole = [{ userId: "legacy", roleId }];
    const user = await loadAuthUser(f.db, "legacy");
    assert.equal(user?.needsProfileCompletion, roleId === viewerId);
    f.context.user = user;
    const status = await verificationStatus(f.context);
    assert.equal(status.academicNeeded, roleId === viewerId);
    assert.equal(status.ready, roleId === staffId);
  }
});

it("labels legacy Viewer roles Alumni without changing existing accounts or grants", async () => {
  const f = fixture();
  f.tables.User = [{ id: "legacy", _id: "legacy", ...account, status: "active" }];
  f.tables.UserRole = [{ userId: "legacy", roleId: viewerId }];
  const roles = await rolesService.list(f.context, {});
  assert.equal(roles.find((r) => r.key === "viewer")?.name, "Alumni");
  const users = await usersService.list(f.context, { page: 1, pageSize: 20 });
  assert.equal(users[0]?.userRoles[0]?.role.name, "Alumni");
  assert.equal(f.tables.Role![0]!.key, "viewer");
  assert.equal(f.tables.UserRole[0]?.roleId, viewerId);
});

it("defaults managed accounts to Staff without creating or claiming an Alumni profile", async () => {
  const f = fixture();
  f.tables.Alumni = [{ id: "historical", studentNumber: alumniProfile.studentNumber }];
  const before = structuredClone(f.tables.Alumni);
  const user = await usersService.create(f.context, usersSchemas.create.input.parse(account));
  assert.equal(user.userRoles[0]?.roleId, staffId);
  assert.equal(user.alumniId, null);
  assert.equal(f.tables.User?.[0]?.verificationRequired, true);
  assert.equal(f.tables.User?.[0]?.needsProfileCompletion, true);
  assert.deepEqual(f.tables.Alumni, before);
});

it("allows another Super Admin account while preserving protected role scope", async () => {
  const f = fixture();
  const superId = "555555555555555555555555";
  f.tables.Role!.push({ id: superId, key: "super_admin", name: "Super Admin", isSystem: true });
  const user = await usersService.create(
    f.context,
    usersSchemas.create.input.parse({ ...account, roleIds: [superId] }),
  );
  assert.equal(user.userRoles[0]?.role.key, "super_admin");
  const ordinaryAdmin = fixture();
  ordinaryAdmin.context.user!.roles = ["admin"];
  await assert.rejects(
    () => usersService.create(ordinaryAdmin.context, usersSchemas.create.input.parse(account)),
    /Only a super administrator can manage system roles/,
  );
  assert.equal(ordinaryAdmin.tables.User?.length ?? 0, 0);
});

it("denies managed creation to Staff and custom roles even with legacy users.write grants", async () => {
  for (const key of ["staff", "legacy_manager", "viewer"]) {
    const f = fixture();
    f.context.user!.roles = [key];
    await assert.rejects(
      () => usersService.create(f.context, usersSchemas.create.input.parse(account)),
      { code: "FORBIDDEN" },
    );
    assert.equal(f.operations.length, 0);
  }
});

it("rejects Alumni, legacy Viewer, Admin and custom managed role keys, including mixed roles", async () => {
  for (const key of ["viewer", "alumni", "admin", "custom_manager"]) {
    const f = fixture();
    f.tables.Role![0]!.key = key;
    for (const roleIds of [[viewerId], [staffId, viewerId]])
      await assert.rejects(
        () =>
          usersService.create(f.context, usersSchemas.create.input.parse({ ...account, roleIds })),
        /only have Staff or Super Admin/,
      );
    assert.equal(f.tables.User?.length ?? 0, 0);
    assert.equal(f.tables.Alumni?.length ?? 0, 0);
  }
});

it("rejects retired Alumni and contact fields at both contract and direct service boundaries", async () => {
  for (const extra of [
    { alumniProfile },
    { phoneNumber: alumniProfile.phoneNumber },
    { gender: "Female" },
  ]) {
    const f = fixture();
    const input = { middleName: "", suffix: "", ...account, ...extra };
    assert.equal(usersSchemas.create.input.safeParse(input).success, false);
    await assert.rejects(() => usersService.create(f.context, input));
    assert.equal(f.operations.length, 0);
  }
});

it("rolls back a managed account if role assignment fails", async () => {
  const f = fixture();
  f.failWrite("UserRole", "insertMany", new Error("Synthetic assignment failure"));
  await assert.rejects(
    () => usersService.create(f.context, usersSchemas.create.input.parse(account)),
    /Synthetic assignment failure/,
  );
  assert.equal(f.tables.User?.length ?? 0, 0);
  assert.equal(f.tables.UserRole?.length ?? 0, 0);
});

it("prevents managed accounts from becoming Alumni while preserving historical Alumni role edits", async () => {
  for (const currentRoleIds of [[staffId], [staffId, viewerId]]) {
    const f = fixture();
    f.tables.User = [{ id: "managed", ...account, updatedAt: new Date(), status: "active" }];
    f.tables.UserRole = currentRoleIds.map((roleId) => ({ id: roleId, userId: "managed", roleId }));
    await assert.rejects(
      () => usersService.update(f.context, { id: "managed", roleIds: [viewerId] }),
      /cannot be converted to Alumni/,
    );
    assert.deepEqual(
      f.tables.UserRole.map((row) => row.roleId),
      currentRoleIds,
    );
  }
  const f = fixture();
  f.tables.User = [
    { id: "historical", ...account, updatedAt: new Date(), status: "active", alumniId: "profile" },
  ];
  f.tables.UserRole = [{ userId: "historical", roleId: viewerId }];
  await usersService.update(f.context, { id: "historical", roleIds: [viewerId] });
  assert.equal(f.tables.UserRole[0]?.roleId, viewerId);
  assert.equal(f.tables.User[0]?.alumniId, "profile");
});

it("denies Alumni access to other pending accounts even with a legacy management grant", async () => {
  const f = fixture();
  f.context.user!.roles = ["viewer"];
  await assert.rejects(() => alumniService.pendingAccounts(f.context, { page: 1, pageSize: 20 }), {
    code: "FORBIDDEN",
  });
  assert.equal(f.operations.length, 0);
});
