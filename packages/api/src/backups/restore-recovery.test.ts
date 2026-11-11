import assert from "node:assert/strict";
import { it } from "node:test";
import { modelFixture } from "../test-utils/model-test-fixture";
import { recoverInterruptedRestore } from "./restore";

it("marks an interrupted restore failed and releases its restore lock", async () => {
  const f = modelFixture({
    BackupState: [
      { _id: "restore", status: "running", step: "database", error: null },
      {
        _id: "lock",
        kind: "restore",
        owner: "dead-process",
        lockedUntil: new Date("2099-01-01T00:00:00.000Z"),
      },
      { _id: "maintenance", active: true },
    ],
  });

  assert.equal(await recoverInterruptedRestore(f.db), true);
  const restore = f.tables.BackupState!.find((row) => row._id === "restore")!;
  const lock = f.tables.BackupState!.find((row) => row._id === "lock")!;
  const maintenance = f.tables.BackupState!.find((row) => row._id === "maintenance")!;
  assert.equal(restore.status, "failed");
  assert.match(String(restore.error), /server stopped.*database/i);
  assert.equal((lock.lockedUntil as Date).getTime(), 0);
  assert.equal(maintenance.active, true, "recovery must not silently expose an unchecked database");
  assert.equal(await recoverInterruptedRestore(f.db), false);
});
