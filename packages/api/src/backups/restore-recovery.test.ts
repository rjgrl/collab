import assert from "node:assert/strict";
import { it } from "node:test";
import { modelFixture } from "../test-utils/model-test-fixture";
import { RESTORE_STALE_MS, recoverInterruptedRestore } from "./restore";

const now = new Date("2026-11-11T10:00:00.000Z");
function fixture(heartbeatAt: Date) {
  return modelFixture({
    BackupState: [
      {
        _id: "restore",
        status: "running",
        step: "database",
        error: null,
        lockOwner: "restore-dead",
        heartbeatAt,
      },
      {
        _id: "lock",
        kind: "restore",
        owner: "restore-dead",
        lockedUntil: new Date("2099-01-01T00:00:00.000Z"),
      },
      { _id: "maintenance", active: true },
    ],
  });
}
const row = (f: ReturnType<typeof fixture>, id: string) =>
  f.tables.BackupState!.find((item) => item._id === id)!;

it("marks a restore with a stale heartbeat failed and releases only its own lock", async () => {
  const f = fixture(new Date(now.getTime() - RESTORE_STALE_MS - 1));
  assert.equal(await recoverInterruptedRestore(f.db, now), true);
  assert.equal(row(f, "restore").status, "failed");
  assert.match(String(row(f, "restore").error), /server stopped.*database/i);
  assert.equal((row(f, "lock").lockedUntil as Date).getTime(), 0);
  assert.equal(row(f, "maintenance").active, true, "an unchecked database stays in maintenance");
  assert.equal(await recoverInterruptedRestore(f.db, now), false);
});

it("never touches a restore that is still running on another instance", async () => {
  const f = fixture(new Date(now.getTime() - 10_000));
  assert.equal(await recoverInterruptedRestore(f.db, now), false);
  assert.equal(row(f, "restore").status, "running");
  assert.equal((row(f, "lock").lockedUntil as Date).getUTCFullYear(), 2099);
});

it("leaves a lock taken by someone else after the restore died", async () => {
  const f = fixture(new Date(now.getTime() - RESTORE_STALE_MS - 1));
  Object.assign(row(f, "lock"), { owner: "backup-new", kind: "backup" });
  assert.equal(await recoverInterruptedRestore(f.db, now), true);
  assert.equal((row(f, "lock").lockedUntil as Date).getUTCFullYear(), 2099);
});
