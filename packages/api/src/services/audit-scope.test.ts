import assert from "node:assert/strict";
import { it } from "node:test";
import type { Context } from "../context";
import { modelFixture } from "../test-utils/model-test-fixture";
import { auditService } from "../../../../apps/server/src/modules/audit/service"; // eslint-disable-line @typescript-eslint/no-unused-vars

// One college with two departments (IT, Auto) and a second college (Education).
const college = "c00000000000000000000001",
  otherCollege = "c00000000000000000000002";
const it_ = "d00000000000000000000001",
  auto = "d00000000000000000000002",
  edu = "d00000000000000000000003";
const bsit = "p00000000000000000000001",
  bsat = "p00000000000000000000002",
  bsed = "p00000000000000000000003";
const gIt = "a00000000000000000000001",
  gAuto = "a00000000000000000000002",
  gEdu = "a00000000000000000000003";
const fIt = "f00000000000000000000001",
  fAuto = "f00000000000000000000002",
  fEdu = "f00000000000000000000003",
  head = "f00000000000000000000009";
const headUser = "u00000000000000000000009";

function fixture(roleLevel: "faculty" | "department" | "college") {
  const f = modelFixture({
    Department: [
      { _id: it_, id: it_, collegeId: college },
      { _id: auto, id: auto, collegeId: college },
      { _id: edu, id: edu, collegeId: otherCollege },
    ],
    Program: [
      { _id: bsit, id: bsit, departmentId: it_ },
      { _id: bsat, id: bsat, departmentId: auto },
      { _id: bsed, id: bsed, departmentId: edu },
    ],
    Alumni: [
      { _id: gIt, id: gIt, programId: bsit, assignedFacultyId: fIt },
      { _id: gAuto, id: gAuto, programId: bsat },
      { _id: gEdu, id: gEdu, programId: bsed },
    ],
    Faculty: [
      {
        _id: head,
        id: head,
        userId: headUser,
        departmentId: it_,
        roleLevel,
        active: true,
        deletedAt: null,
      },
      { _id: fIt, id: fIt, departmentId: it_, roleLevel: "faculty", active: true, deletedAt: null },
      {
        _id: fAuto,
        id: fAuto,
        departmentId: auto,
        roleLevel: "faculty",
        active: true,
        deletedAt: null,
      },
      {
        _id: fEdu,
        id: fEdu,
        departmentId: edu,
        roleLevel: "faculty",
        active: true,
        deletedAt: null,
      },
    ],
    AuditLog: [
      {
        id: "e1",
        action: "alumni.update",
        entity: "alumni",
        entityId: gIt,
        summary: "it",
        createdAt: new Date(1),
      },
      {
        id: "e2",
        action: "contacts.create",
        entity: "alumniContact",
        entityId: "x",
        summary: "it contact",
        metadata: { alumniId: gIt },
        createdAt: new Date(2),
      },
      {
        id: "e3",
        action: "alumni.update",
        entity: "alumni",
        entityId: gAuto,
        summary: "auto",
        createdAt: new Date(3),
      },
      {
        id: "e4",
        action: "alumni.update",
        entity: "alumni",
        entityId: gEdu,
        summary: "edu",
        createdAt: new Date(4),
      },
      {
        id: "e5",
        action: "faculty.role",
        entity: "faculty",
        entityId: fIt,
        summary: "it faculty",
        createdAt: new Date(5),
      },
      {
        id: "e6",
        action: "faculty.role",
        entity: "faculty",
        entityId: fEdu,
        summary: "edu faculty",
        createdAt: new Date(6),
      },
      {
        id: "e7",
        action: "users.create",
        entity: "user",
        entityId: "someone",
        summary: "account",
        createdAt: new Date(7),
      },
    ],
  });
  const context = {
    db: f.db,
    user: {
      id: headUser,
      name: "Head",
      email: "head@buksu.edu.ph",
      image: null,
      status: "active",
      roles: ["faculty"],
      permissions: ["alumni.read"],
      mfaVerified: true,
    },
    sessionToken: null,
    ipAddress: null,
    userAgent: null,
    integrationEnv: {},
  } as Context;
  return { ...f, context };
}
const ids = async (context: Context) =>
  (await auditService.list(context, { page: 1, pageSize: 50 })).map((row) => row.id).sort();

it("department heads see audit entries for their department's alumni and faculty only", async () => {
  assert.deepEqual(await ids(fixture("department").context), ["e1", "e2", "e5"]);
});

it("college heads see audit entries across their college but not other colleges", async () => {
  assert.deepEqual(await ids(fixture("college").context), ["e1", "e2", "e3", "e5"]);
});

it("faculty-level accounts cannot read the audit log", async () => {
  await assert.rejects(() => auditService.list(fixture("faculty").context, {}), {
    code: "FORBIDDEN",
  });
});

it("audit.read holders (Administrators) still see every entry", async () => {
  const f = fixture("faculty");
  f.context.user!.roles = ["super_admin"];
  f.context.user!.permissions = ["alumni.read", "audit.read"];
  assert.deepEqual(await ids(f.context), ["e1", "e2", "e3", "e4", "e5", "e6", "e7"]);
});

it("alumni accounts see only their own entries", async () => {
  const alumniUserId = "u00000000000000000a0001";
  const otherAlumniId = "a00000000000000000a0002";

  const f = modelFixture({
    Department: [
      { _id: it_, id: it_, collegeId: college },
      { _id: auto, id: auto, collegeId: college },
    ],
    Program: [
      { _id: bsit, id: bsit, departmentId: it_ },
      { _id: bsat, id: bsat, departmentId: auto },
    ],
    Alumni: [
      { _id: gIt, id: gIt, programId: bsit },
      { _id: otherAlumniId, id: otherAlumniId, programId: bsat },
    ],
    User: [
      {
        id: alumniUserId,
        name: "Alumni A",
        email: "alumni@example.com",
        status: "active",
        alumniId: gIt,
        mfaVerified: true,
        needsProfileCompletion: false,
        verificationRequired: false,
      },
    ],
    Role: [{ id: "role_alumni", _id: "role_alumni", name: "Alumni", key: "alumni" }],
    UserRole: [{ userId: alumniUserId, roleId: "role_alumni" }],
    AuditLog: [
      {
        id: "a1",
        action: "auth.login",
        entity: "user",
        entityId: alumniUserId,
        actorId: alumniUserId,
        summary: "Alumni A signed in",
        metadata: {
          actorSnapshot: { id: alumniUserId, name: "Alumni A", email: "alumni@example.com" },
        },
        createdAt: new Date(1),
      },
      {
        id: "a2",
        action: "alumni.update",
        entity: "alumni",
        entityId: gIt,
        summary: "Admin updated alumni A",
        metadata: { alumniId: gIt },
        createdAt: new Date(2),
      },
      {
        id: "a3",
        action: "contacts.create",
        entity: "alumniContact",
        entityId: "contact-x",
        summary: "Contact added",
        metadata: { alumniId: gIt },
        createdAt: new Date(3),
      },
      {
        id: "a4",
        action: "auth.login",
        entity: "user",
        entityId: "u00000000000000000a0003",
        actorId: "u00000000000000000a0003",
        summary: "Alumni B signed in",
        metadata: {
          actorSnapshot: {
            id: "u00000000000000000a0003",
            name: "Alumni B",
            email: "alumni_b@example.com",
          },
        },
        createdAt: new Date(4),
      },
      {
        id: "a5",
        action: "alumni.update",
        entity: "alumni",
        entityId: otherAlumniId,
        summary: "Admin updated alumni B",
        metadata: { alumniId: otherAlumniId },
        createdAt: new Date(5),
      },
      {
        id: "a6",
        action: "users.create",
        entity: "user",
        entityId: "new-admin",
        summary: "Admin created user",
        createdAt: new Date(6),
      },
    ],
  });

  const context = {
    db: f.db,
    user: {
      id: alumniUserId,
      name: "Alumni A",
      email: "alumni@example.com",
      image: null,
      status: "active",
      roles: ["alumni"],
      permissions: [],
      mfaVerified: true,
      needsProfileCompletion: false,
      alumniId: gIt,
    },
    sessionToken: null,
    ipAddress: null,
    userAgent: null,
    integrationEnv: {},
  } as Context;

  assert.deepEqual(
    (await auditService.list(context, { page: 1, pageSize: 50 })).map((row) => row.id).sort(),
    ["a1", "a2", "a3"],
  );
});

it("alumni without alumniId see only entries they acted in", async () => {
  const alumniUserId = "u00000000000000000a0004";
  const f = modelFixture({
    User: [
      {
        id: alumniUserId,
        name: "Alumni No ID",
        email: "alumni_noid@example.com",
        status: "active",
        mfaVerified: true,
        needsProfileCompletion: false,
        verificationRequired: false,
      },
    ],
    Role: [{ id: "role_viewer", _id: "role_viewer", name: "Viewer", key: "viewer" }],
    UserRole: [{ userId: alumniUserId, roleId: "role_viewer" }],
    AuditLog: [
      {
        id: "b1",
        action: "auth.login",
        entity: "user",
        entityId: alumniUserId,
        actorId: alumniUserId,
        summary: "Alumni no ID signed in",
        createdAt: new Date(1),
      },
      {
        id: "b2",
        action: "users.update",
        entity: "user",
        entityId: "other-user",
        summary: "Someone else updated",
        createdAt: new Date(2),
      },
    ],
  });

  const context = {
    db: f.db,
    user: {
      id: alumniUserId,
      name: "Alumni No ID",
      email: "alumni_noid@example.com",
      image: null,
      status: "active",
      roles: ["viewer"],
      permissions: [],
      mfaVerified: true,
      needsProfileCompletion: false,
    },
    sessionToken: null,
    ipAddress: null,
    userAgent: null,
    integrationEnv: {},
  } as Context;

  assert.deepEqual(
    (await auditService.list(context, { page: 1, pageSize: 50 })).map((row) => row.id).sort(),
    ["b1"],
  );
});
