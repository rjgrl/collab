import assert from "node:assert/strict";
import { it } from "node:test";
import type { Context } from "../context";
import { modelFixture } from "./model-test-fixture";
import {
  notifyStaffOfEvidence,
  notificationsService,
} from "../../../../apps/server/src/modules/notifications/service";

// The reviewer is the alumnus's assigned faculty member; heads of the alumnus's department and
// college are notified too. Inactive faculty, disabled accounts and other colleges are not.
const staff = "111111111111111111111111",
  other = "222222222222222222222222";
const evidence = "444444444444444444444444";
const alumni = "555555555555555555555555",
  notification = "666666666666666666666666";
const deptHead = "777777777777777777777771",
  collegeHead = "777777777777777777777772",
  inactiveHead = "777777777777777777777773",
  otherCollegeHead = "777777777777777777777774";
const program = "888888888888888888888881",
  department = "888888888888888888888882",
  sibling = "888888888888888888888883",
  foreign = "888888888888888888888884",
  college = "888888888888888888888885",
  otherCollege = "888888888888888888888886";
const faculty = (id: string, userId: string, extra: object) => ({
  _id: `f${id.slice(1)}`,
  id: `f${id.slice(1)}`,
  userId,
  active: true,
  deletedAt: null,
  ...extra,
});
function fixture() {
  const f = modelFixture({
    Alumni: [
      { _id: alumni, id: alumni, programId: program, assignedFacultyId: `f${staff.slice(1)}` },
    ],
    Program: [{ _id: program, id: program, departmentId: department }],
    Department: [
      { _id: department, id: department, collegeId: college },
      { _id: sibling, id: sibling, collegeId: college },
      { _id: foreign, id: foreign, collegeId: otherCollege },
    ],
    Faculty: [
      faculty(staff, staff, { departmentId: sibling, roleLevel: "faculty" }),
      faculty(deptHead, deptHead, { departmentId: department, roleLevel: "department" }),
      faculty(collegeHead, collegeHead, { departmentId: sibling, roleLevel: "college" }),
      faculty(inactiveHead, inactiveHead, {
        departmentId: department,
        roleLevel: "department",
        active: false,
      }),
      faculty(otherCollegeHead, otherCollegeHead, { departmentId: foreign, roleLevel: "college" }),
      faculty(other, other, { departmentId: department, roleLevel: "department" }),
    ],
    User: [
      { _id: staff, status: "active" },
      { _id: other, status: "disabled" },
      { _id: deptHead, status: "active" },
      { _id: collegeHead, status: "active" },
      { _id: inactiveHead, status: "active" },
      { _id: otherCollegeHead, status: "active" },
    ],
    Notification: [
      {
        _id: notification,
        id: notification,
        recipientId: staff,
        alumniId: alumni,
        evidenceId: evidence,
        summary: "Evidence awaiting review",
        readAt: null,
        createdAt: new Date(),
      },
    ],
  });
  const context = {
    db: f.db,
    user: {
      id: staff,
      status: "active",
      roles: ["faculty"],
      permissions: ["alumni.read", "files.read"],
      mfaVerified: true,
    },
    integrationEnv: {},
    sessionToken: null,
  } as Context;
  return { ...f, context };
}

it("notifies the assigned faculty member and in-scope heads once each", async () => {
  const f = fixture();
  f.tables.Notification = [];
  await notifyStaffOfEvidence(f.db, {
    alumniId: alumni,
    evidenceId: evidence,
    alumniName: "Test Graduate",
    studentNumber: "SYN-001",
    originalName: "Proof.png",
  });
  assert.deepEqual(
    f.tables.Notification.map((row) => String(row.recipientId)).sort(),
    [staff, deptHead, collegeHead].sort(),
  );
  for (const row of f.tables.Notification) {
    assert.equal(row.evidenceId, evidence);
    assert.match(String(row.summary), /Test Graduate.*SYN-001.*Proof.png.*review/);
  }
});

it("notifies nobody for an alumnus without a program or assignment", async () => {
  const f = fixture();
  f.tables.Notification = [];
  f.tables.Alumni = [{ _id: alumni, id: alumni, programId: "999999999999999999999999" }];
  await notifyStaffOfEvidence(f.db, {
    alumniId: alumni,
    evidenceId: evidence,
    alumniName: "Test Graduate",
    studentNumber: "SYN-001",
    originalName: "Proof.png",
  });
  assert.equal(f.tables.Notification.length, 0);
});

it("returns only the signed-in reviewer's notifications and unread count", async () => {
  const f = fixture();
  f.tables.Notification!.push({
    id: "foreign",
    recipientId: other,
    summary: "Private other notification",
    readAt: null,
  });
  const result = await notificationsService.list(f.context, {});
  assert.equal(result.unreadCount, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.id, notification);
});

it("marks a notification read idempotently without permitting another recipient's mutation", async () => {
  const f = fixture();
  await notificationsService.markRead(f.context, { id: notification });
  const readAt = f.tables.Notification![0]!.readAt;
  assert.ok(readAt instanceof Date);
  await notificationsService.markRead(f.context, { id: notification });
  assert.deepEqual(f.tables.Notification![0]!.readAt, readAt);
  assert.equal((await notificationsService.list(f.context, {})).unreadCount, 0);
  f.context.user!.id = other;
  await assert.rejects(() => notificationsService.markRead(f.context, { id: notification }), {
    code: "NOT_FOUND",
  });
});

it("hides reviewer notifications after permission or role removal, even with legacy broad grants", async () => {
  for (const roles of [["viewer"], ["super_admin"], ["staff"], ["faculty"]]) {
    const f = fixture();
    f.context.user!.roles = roles;
    if (roles[0] === "faculty") f.context.user!.permissions = ["alumni.read"];
    assert.deepEqual(await notificationsService.list(f.context, {}), { items: [], unreadCount: 0 });
    await assert.rejects(() => notificationsService.markRead(f.context, { id: notification }), {
      code: "FORBIDDEN",
    });
  }
});

it("rejects unauthenticated notification reads", async () => {
  const f = fixture();
  f.context.user = null;
  await assert.rejects(() => notificationsService.list(f.context, {}), { code: "UNAUTHORIZED" });
});

it("rolls back evidence and notifications together when reviewer notification persistence fails", async () => {
  const f = fixture();
  f.tables.Notification = [];
  f.failWrite("Notification", "insertMany", new Error("Synthetic notification failure"));
  await assert.rejects(
    () =>
      f.db.transaction(async (tx) => {
        await tx.EvidenceFile.create({ alumniId: alumni, originalName: "Proof.png" });
        await notifyStaffOfEvidence(tx, {
          alumniId: alumni,
          evidenceId: evidence,
          alumniName: "Graduate",
          studentNumber: "SYN-001",
          originalName: "Proof.png",
        });
      }),
    /Synthetic notification failure/,
  );
  assert.equal(f.tables.EvidenceFile?.length ?? 0, 0);
  assert.equal(f.tables.Notification.length, 0);
});
