import assert from "node:assert/strict";
import { it } from "node:test";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { claimSlot, dueSlot, runSchedulerTick } from "./scheduler";
import type { CatalogEntry } from "./backup-service";

it("computes daily and weekly slots in Asia/Manila (UTC+8)", () => {
  const daily = { frequency: "daily" as const, time: "02:00", weekday: 0, retention: 7 };
  // 01:59 and 02:00 in Manila on 2026-11-10 are 17:59 and 18:00 UTC on 2026-11-09.
  assert.equal(dueSlot(daily, new Date("2026-11-09T17:59:00Z")), null);
  assert.equal(dueSlot(daily, new Date("2026-11-09T18:00:00Z")), "2026-11-10T02:00");
  assert.equal(dueSlot(daily, new Date("2026-11-10T15:00:00Z")), "2026-11-10T02:00");
  // 2026-11-10 is a Tuesday (weekday 2) in Manila.
  const weekly = { ...daily, frequency: "weekly" as const, weekday: 2 };
  assert.equal(dueSlot(weekly, new Date("2026-11-09T18:30:00Z")), "2026-11-10T02:00");
  assert.equal(dueSlot({ ...weekly, weekday: 3 }, new Date("2026-11-09T18:30:00Z")), null);
  assert.equal(dueSlot({ ...daily, frequency: "off" }, new Date("2026-11-09T18:30:00Z")), null);
  assert.equal(dueSlot(null, new Date()), null);
});

/** In-memory BackupState with atomic single-threaded conditional updates, like MongoDB's. */
function fakeDb() {
  const state: Record<string, Record<string, unknown>> = {
    schedule: { _id: "schedule", frequency: "daily", time: "02:00", retention: 7 },
  };
  const exec = <T>(value: T) => ({
    exec: async () => value,
    lean: () => ({ exec: async () => value }),
  });
  const db = {
    BackupState: {
      findById: (id: string) => exec(state[id] ?? null),
      updateOne: (
        filter: { _id: string; lastSlot?: { $ne: string }; owner?: string },
        update: { $set: Record<string, unknown> },
      ) => {
        const row = state[filter._id];
        const matches =
          row &&
          (!filter.lastSlot || row.lastSlot !== filter.lastSlot.$ne) &&
          (!filter.owner || row.owner === filter.owner);
        if (matches) Object.assign(row, update.$set);
        return exec({ modifiedCount: matches ? 1 : 0 });
      },
      findOneAndUpdate: (_filter: unknown, update: { $set: Record<string, unknown> }) => {
        const row = state.lock;
        if (row && (row.lockedUntil as Date) > new Date()) {
          const error = Object.assign(new Error("duplicate"), { code: 11000 });
          return { exec: async () => Promise.reject(error) };
        }
        state.lock = { _id: "lock", ...update.$set };
        return exec(state.lock);
      },
    },
  };
  return db as unknown as Database;
}

it("lets exactly one concurrent caller claim a slot", async () => {
  const db = fakeDb();
  const results = await Promise.all([
    claimSlot(db, "2026-11-10T02:00"),
    claimSlot(db, "2026-11-10T02:00"),
  ]);
  assert.deepEqual(results.sort(), [false, true]);
  assert.equal(await claimSlot(db, "2026-11-11T02:00"), true);
});

it("runs one scheduled backup when two instances tick at the same time", async () => {
  const db = fakeDb();
  let created = 0;
  const create = async () => {
    created++;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { backupId: "x" } as CatalogEntry;
  };
  const now = new Date("2026-11-09T18:05:00Z");
  await Promise.all([
    runSchedulerTick({ db, config: undefined, now, owner: "a", create }),
    runSchedulerTick({ db, config: undefined, now, owner: "b", create }),
  ]);
  assert.equal(created, 1);
});
