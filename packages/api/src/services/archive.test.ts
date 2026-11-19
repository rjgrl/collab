import assert from "node:assert/strict";
import { it } from "node:test";
import type { Context, AuthUser } from "../context";
import { modelFixture } from "../test-utils/model-test-fixture";
import { alumniService } from "../../../../apps/server/src/modules/alumni/service";

const id = "000000000000000000000201";
const program = "000000000000000000000302";
const department = "000000000000000000000301";
const college = "000000000000000000000300";
function fixture() {
  const f = modelFixture({
    Alumni: [
      {
        id,
        studentNumber: "ARCHIVED-1",
        firstName: "Test",
        lastName: "Graduate",
        programId: program,
        assignedFacultyId: "000000000000000000000401",
        deletedAt: new Date("2025-01-01"),
      },
    ],
    Program: [{ id: program, departmentId: department }],
    Department: [{ id: department, collegeId: college }],
    College: [{ id: college }],
    Faculty: [],
  });
  const context: Context = {
    db: f.db,
    user: {
      id: "000000000000000000000001",
      name: "Admin",
      email: "admin@example.test",
      status: "active",
      roles: ["super_admin"],
      permissions: ["alumni.read", "alumni.write"],
      mfaVerified: true,
    } as AuthUser,
    sessionToken: null,
    ipAddress: null,
    userAgent: null,
    integrationEnv: {},
  };
  return { ...f, context };
}

it("restores alumni atomically, audits recovery and flags inactive trackers for reassignment", async () => {
  const f = fixture();
  assert.deepEqual(await alumniService.restore(f.context, { id }), { ok: true });
  const restored = f.tables.Alumni![0]!;
  assert.equal(restored.deletedAt, null);
  assert.equal(restored.assignedFacultyId, null);
  assert.equal(restored.needsReassignment, true);
  assert.equal(f.tables.AuditLog![0]!.action, "alumni.restore");
});

it("refuses archived academic parents and leaves the alumni record archived", async () => {
  const f = fixture();
  f.tables.Department![0]!.deletedAt = new Date();
  await assert.rejects(alumniService.restore(f.context, { id }), /linked academic records/);
  assert.ok(f.tables.Alumni![0]!.deletedAt);
  assert.equal(f.tables.AuditLog?.length ?? 0, 0);
});

it("rejects non-Super-Admin archive reads and restoration even with broad permissions", async () => {
  for (const roles of [["faculty"], ["alumni"], ["custom_manager"]]) {
    const f = fixture();
    f.context.user!.roles = roles;
    await assert.rejects(alumniService.archived(f.context, { page: 1, pageSize: 20 }), {
      code: "FORBIDDEN",
    });
    await assert.rejects(alumniService.restore(f.context, { id }), { code: "FORBIDDEN" });
    assert.ok(f.tables.Alumni![0]!.deletedAt);
  }
});
