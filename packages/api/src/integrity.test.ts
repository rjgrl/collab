import assert from "node:assert/strict";
import { it } from "node:test";
import { modelFixture } from "./test-utils/model-test-fixture";
import { integritySlot, runIntegrityTick } from "./integrity";

it("runs from 03:30 Asia/Manila (UTC+8)", () => {
  // 03:29 and 03:30 in Manila on 2026-11-12 are 19:29 and 19:30 UTC on 2026-11-11.
  assert.equal(integritySlot(new Date("2026-11-11T19:29:00Z")), null);
  assert.equal(integritySlot(new Date("2026-11-11T19:30:00Z")), "2026-11-12");
});

it("runs once per night, and only reports when references are broken", async () => {
  const f = modelFixture({
    BackupState: [{ _id: "integrity", lastSlot: "2026-11-11" }],
    Role: [{ _id: "role-super", key: "super_admin" }],
    UserRole: [{ userId: "admin", roleId: "role-super" }],
    User: [{ _id: "admin", status: "active" }],
  });
  const now = new Date("2026-11-11T20:00:00Z");
  const broken = [{ reference: "Alumni.programId -> Program", count: 2, sample: ["a", "b"] }];
  assert.deepEqual(await runIntegrityTick({ db: f.db, now, find: async () => broken }), broken);
  assert.equal(await runIntegrityTick({ db: f.db, now, find: async () => broken }), null);
  const state = f.tables.BackupState!.find((row) => row._id === "integrity")!;
  assert.equal(state.status, "problems");
  assert.match(String(state.error), /Alumni\.programId -> Program \(2\)/);
  assert.equal(f.tables.AuditLog?.[0]?.action, "integrity.references");
  assert.match(
    String(f.tables.Notification?.[0]?.summary),
    /2 record\(s\) point at missing records/,
  );

  // A clean night records "ok" and stays quiet.
  const next = new Date("2026-11-12T20:00:00Z");
  assert.deepEqual(await runIntegrityTick({ db: f.db, now: next, find: async () => [] }), []);
  assert.equal(f.tables.BackupState!.find((row) => row._id === "integrity")!.status, "ok");
  assert.equal(f.tables.Notification!.length, 1);
});
