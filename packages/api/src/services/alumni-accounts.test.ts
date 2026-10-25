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

it("labels legacy Viewer roles Alumni in role lists and member accounts without changing grants", async () => {
  const f = fixture();
  const roles = await rolesService.list(f.context, {});
  assert.equal(roles.find((r) => r.key === "viewer")?.name, "Alumni");
  assert.equal(f.tables.Role![0]!.key, "viewer");
  const user = await usersService.create(
    f.context,
    usersSchemas.create.input.parse({
      ...account,
      roleIds: [viewerId],
      alumniProfile,
    }),
  );
  assert.equal(user.userRoles[0]?.role.name, "Alumni");
  assert.equal(user.userRoles[0]?.role.key, "viewer");
});

it("defaults new accounts to Alumni and creates their linked registry profile", async () => {
  const f = fixture();
  const user = await usersService.create(
    f.context,
    usersSchemas.create.input.parse({
      ...account,
      alumniProfile,
    }),
  );
  assert.equal(user.userRoles[0]?.roleId, viewerId);
  assert.equal(user.alumniId, f.tables.Alumni?.[0]?.id);
  assert.equal(f.tables.User?.[0]?.needsProfileCompletion, false);
  assert.equal(f.tables.User?.[0]?.verificationRequired, true);
  assert.equal(f.tables.Alumni?.[0]?.studentNumber, alumniProfile.studentNumber);
  assert.equal(f.tables.Alumni?.[0]?.personalEmail, account.email);
});

it("denies Alumni access to other pending accounts even with a legacy management grant", async () => {
  const f = fixture();
  f.context.user!.roles = ["viewer"];
  await assert.rejects(() => alumniService.pendingAccounts(f.context, { page: 1, pageSize: 20 }), {
    code: "FORBIDDEN",
  });
  assert.equal(f.operations.length, 0);
});

it("rejects Alumni accounts with missing academic details instead of creating an orphan", async () => {
  const f = fixture();
  await assert.rejects(
    () =>
      usersService.create(
        f.context,
        usersSchemas.create.input.parse({
          ...account,
          roleIds: [viewerId],
        }),
      ),
    /Alumni.*profile|profile.*Alumni/i,
  );
  assert.equal(f.tables.User?.length ?? 0, 0);
  assert.equal(f.tables.Alumni?.length ?? 0, 0);
});

it("preserves Staff creation without requiring an Alumni profile", async () => {
  const f = fixture();
  const user = await usersService.create(
    f.context,
    usersSchemas.create.input.parse({
      ...account,
      roleIds: [staffId],
    }),
  );
  assert.equal(user.alumniId, null);
  assert.equal(user.userRoles[0]?.role.key, "staff");
  assert.equal(f.tables.Alumni?.length ?? 0, 0);
});

it("rolls back the profile when account creation fails", async () => {
  const f = fixture();
  f.failWrite("User", "create", new Error("Synthetic account failure"));
  await assert.rejects(
    () =>
      usersService.create(
        f.context,
        usersSchemas.create.input.parse({
          ...account,
          roleIds: [viewerId],
          alumniProfile,
        }),
      ),
    /Synthetic account failure/,
  );
  assert.equal(f.tables.Alumni?.length ?? 0, 0);
  assert.equal(f.tables.UserRole?.length ?? 0, 0);
});

it("requires Alumni write access before provisioning a linked profile", async () => {
  const f = fixture();
  f.context.user!.permissions = f.context.user!.permissions.filter((p) => p !== "alumni.write");
  await assert.rejects(
    () =>
      usersService.create(
        f.context,
        usersSchemas.create.input.parse({
          ...account,
          roleIds: [viewerId],
          alumniProfile,
        }),
      ),
    { code: "FORBIDDEN" },
  );
  assert.equal(f.tables.Alumni?.length ?? 0, 0);
  assert.equal(f.tables.User?.length ?? 0, 0);
});

it("does not claim existing student records or allow inactive programs when creating accounts", async () => {
  for (const conflict of [true, false]) {
    const f = fixture();
    if (conflict)
      f.tables.Alumni = [{ id: "existing", studentNumber: alumniProfile.studentNumber }];
    else f.tables.Program![0]!.deletedAt = new Date();
    await assert.rejects(
      () =>
        usersService.create(
          f.context,
          usersSchemas.create.input.parse({
            ...account,
            roleIds: [viewerId],
            alumniProfile,
          }),
        ),
      conflict ? /existing profile/ : /active degree program/,
    );
    assert.equal(f.tables.User?.length ?? 0, 0);
  }
});
