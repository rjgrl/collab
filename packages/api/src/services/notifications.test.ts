import assert from "node:assert/strict";
import { it } from "node:test";
import type { Context } from "../context";
import { modelFixture } from "./model-test-fixture";
import {
  notifyStaffOfEvidence,
  notificationsService,
} from "../../../../apps/server/src/modules/notifications/service";

const staff = "111111111111111111111111",
  other = "222222222222222222222222";
const role = "333333333333333333333333",
  evidence = "444444444444444444444444";
const alumni = "555555555555555555555555",
  notification = "666666666666666666666666";
function fixture() {
  const f = modelFixture({
    Role: [{ _id: role, key: "staff" }],
    UserRole: [
      { userId: staff, roleId: role },
      { userId: staff, roleId: role },
      { userId: other, roleId: role },
    ],
    User: [
      { _id: staff, status: "active" },
      { _id: other, status: "disabled" },
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
      roles: ["staff"],
      permissions: ["alumni.read", "files.read"],
      mfaVerified: true,
    },
    integrationEnv: {},
    sessionToken: null,
  } as Context;
  return { ...f, context };
}

it("notifies each active Staff account once and preserves the uploaded evidence identity", async () => {
  const f = fixture();
  f.tables.Notification = [];
  await notifyStaffOfEvidence(f.db, {
    alumniId: alumni,
    evidenceId: evidence,
    alumniName: "Test Graduate",
    studentNumber: "SYN-001",
    originalName: "Proof.png",
  });
  assert.equal(f.tables.Notification.length, 1);
  assert.equal(f.tables.Notification[0]?.recipientId, staff);
  assert.equal(f.tables.Notification[0]?.evidenceId, evidence);
  assert.match(
    String(f.tables.Notification[0]?.summary),
    /Test Graduate.*SYN-001.*Proof.png.*review/,
  );
});

it("returns only the signed-in Staff recipient's notifications and unread count", async () => {
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

it("hides Staff notifications after permission or role removal, even with legacy broad grants", async () => {
  for (const roles of [["viewer"], ["super_admin"], ["staff"]]) {
    const f = fixture();
    f.context.user!.roles = roles;
    if (roles[0] === "staff") f.context.user!.permissions = ["alumni.read"];
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

it("rolls back evidence and notifications together when Staff notification persistence fails", async () => {
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
