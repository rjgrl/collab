import assert from "node:assert/strict";
import { it } from "node:test";
import type { Context } from "../context";
import { modelFixture } from "../test-utils/model-test-fixture";
import { assertRoleScope, validatePermissionIds } from "./authorization";
import { importAlumniRows } from "./importer";
import {
  programsService,
  departmentsService,
  collegeWriteService,
} from "../../../../apps/server/src/modules/academic/service";
import { integrationsService } from "../../../../apps/server/src/modules/integrations/service";
import { permissionsService } from "../../../../apps/server/src/modules/roles/service";

const own = "111111111111111111111111";
const other = "222222222222222222222222";
const college = "333333333333333333333333";
function fixture(permissions: string[] = []) {
  const f = modelFixture({
    Department: [
      { _id: own, name: "Own department", collegeId: college, deletedAt: null },
      { _id: other, name: "Other department", collegeId: college, deletedAt: null },
    ],
    Faculty: [
      {
        _id: "faculty",
        userId: "operator",
        departmentId: own,
        roleLevel: "faculty",
        active: true,
        deletedAt: null,
      },
    ],
    Program: [
      {
        _id: "444444444444444444444444",
        code: "EXISTING",
        name: "Existing program",
        departmentId: own,
        deletedAt: null,
      },
    ],
    Permission: [{ _id: "p-roles.write", key: "roles.write" }],
  });
  const context = {
    db: f.db,
    user: {
      id: "operator",
      roles: ["faculty"],
      permissions,
      status: "active",
      mfaVerified: true,
      needsProfileCompletion: false,
    },
    sessionToken: "session",
    ipAddress: null,
    userAgent: null,
    integrationEnv: {},
  } as Context;
  return { f, context };
}

it("delegated academic writes succeed only inside the existing department scope", async () => {
  const { f, context } = fixture(["programs.write", "departments.write"]);
  const created = await programsService.create(context, {
    name: "Own program",
    code: "OWN",
    departmentId: own,
  });
  assert.equal(String(created.departmentId), own);
  await assert.rejects(
    () =>
      programsService.create(context, {
        name: "Other program",
        code: "OTHER",
        departmentId: other,
      }),
    /outside your scope/,
  );
  await assert.rejects(
    () =>
      programsService.update(context, {
        id: "444444444444444444444444",
        name: "Moved",
        code: "OWN",
        departmentId: other,
      }),
    /outside your scope/,
  );
  await assert.rejects(
    () => departmentsService.update(context, { id: other, name: "Unauthorized" }),
    /outside your scope/,
  );
  await assert.rejects(
    () => collegeWriteService.create(context, { name: "New college" }),
    /outside your scope/,
  );
  assert.equal(f.tables.Program!.length, 2);
  assert.equal(f.tables.Program![0]!.name, "Existing program");
});

it("delegated imports do not reveal or modify out-of-assignment records, including archived ones", async () => {
  const messages: string[] = [];
  for (const deletedAt of [null, new Date()]) {
    const { f, context } = fixture(["integrations.write"]);
    f.tables.Alumni = [
      {
        _id: "555555555555555555555555",
        studentNumber: "SCOPE-1",
        firstName: "Private",
        lastName: "Record",
        programId: "444444444444444444444444",
        deletedAt,
      },
    ];
    const result = await importAlumniRows(
      context.db,
      [
        {
          studentNumber: "SCOPE-1",
          firstName: "Changed",
          lastName: "Name",
          gender: "Female",
          departmentName: "Own department",
          programCode: "EXISTING",
          graduationYear: 2024,
        },
      ],
      { actorId: "operator", context },
    );
    assert.equal(result.successCount, 0);
    assert.equal(result.errorCount, 1);
    messages.push(result.errors[0]!.message);
    assert.equal(f.tables.Alumni[0]!.firstName, "Private");
  }
  assert.equal(messages[0], messages[1]);
  assert.match(messages[0]!, /not found/i);
});

it("a permission switched off still denies access", async () => {
  const { context } = fixture();
  await assert.rejects(
    () => programsService.create(context, { name: "Blocked", code: "BLOCK", departmentId: own }),
    /Missing permission/,
  );
  await assert.rejects(() => integrationsService.list(context), /Missing permission/);
  await assert.rejects(() => permissionsService.list(context, {}), /Missing permission/);
});

it("an explicitly delegated integration read does not require the Super Admin role", async () => {
  const { context } = fixture(["integrations.read"]);
  assert.ok(Array.isArray(await integrationsService.list(context)));
});

it("delegated RBAC can access the catalog but cannot manage protected administrators or grant missing permissions", async () => {
  const { context } = fixture(["permissions.read", "roles.write"]);
  assert.equal((await permissionsService.list(context, {})).length, 1);
  assert.doesNotThrow(() =>
    assertRoleScope(context.user!, [{ key: "faculty", isSystem: true, rolePermissions: [] }]),
  );
  assert.throws(
    () =>
      assertRoleScope(context.user!, [{ key: "super_admin", isSystem: true, rolePermissions: [] }]),
    /Super Admin roles/,
  );
  await assert.rejects(
    () =>
      validatePermissionIds(context.db, { ...context.user!, permissions: [] }, ["p-roles.write"]),
    /cannot grant permissions/,
  );
});
