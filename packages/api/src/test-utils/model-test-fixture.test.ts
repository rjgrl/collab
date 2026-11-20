import assert from "node:assert/strict";
import { it } from "node:test";
import { modelFixture } from "./model-test-fixture";

const rows = () =>
  modelFixture({
    Notification: [
      { _id: "a", n: 2, tags: ["x"] },
      { _id: "b", n: 3, tags: ["y"] },
      { _id: "c", n: 1, tags: ["x", "y"] },
    ],
  });

it("throws instead of guessing on query and update features it does not reproduce", async () => {
  const f = rows();
  await assert.rejects(
    f.db.Notification.find({ tags: { $all: ["x"] } }).exec(),
    /does not support the query operator \$all/,
  );
  await assert.rejects(
    f.db.Notification.find({ $nor: [{ n: 1 }] }).exec(),
    /does not support the query operator \$nor/,
  );
  await assert.rejects(
    f.db.Notification.updateOne({ _id: "a" }, { $push: { tags: "z" } }).exec(),
    /does not support the update operator \$push/,
  );
  await assert.rejects(
    f.db.Notification.updateOne({ _id: "a" }, { n: 9 }).exec(),
    /replacement-style updates/,
  );
});

it("reproduces detached clock writes surviving a business rollback", async () => {
  const f = modelFixture({
    TimestampClock: [{ key: "clock", value: 0 }],
    User: [{ _id: "u", name: "Original" }],
  });
  await assert.rejects(
    () =>
      f.db.transaction(async (tx) => {
        await tx.User.updateOne({ _id: "u" }, { $set: { name: "Rolled back" } });
        await tx.TimestampClock.findOneAndUpdate(
          { key: "clock" },
          { $inc: { value: 1 }, $currentDate: { allocatedAt: true } },
        )
          .session(null)
          .lean();
        throw new Error("Synthetic rollback");
      }),
    /Synthetic rollback/,
  );
  assert.equal(f.tables.User![0]!.name, "Original");
  assert.equal(f.tables.TimestampClock![0]!.value, 1);
  assert.ok(f.tables.TimestampClock![0]!.allocatedAt instanceof Date);
});

it("reproduces monotonic max updates and the edit-context database-time expression", async () => {
  const f = modelFixture({
    AlumniTimestamp: [{ key: "a", readTimestamp: 10 }],
    TimestampEdit: [
      { tokenHash: "expired", expiresAt: new Date(0) },
      { tokenHash: "live", expiresAt: new Date(Date.now() + 60000) },
    ],
  });
  await f.db.AlumniTimestamp.updateOne({ key: "a" }, { $max: { readTimestamp: 9 } });
  assert.equal(f.tables.AlumniTimestamp![0]!.readTimestamp, 10);
  await f.db.AlumniTimestamp.updateOne({ key: "a" }, { $max: { readTimestamp: 11 } });
  assert.equal(f.tables.AlumniTimestamp![0]!.readTimestamp, 11);
  const live = await f.db.TimestampEdit.find({ $expr: { $gt: ["$expiresAt", "$$NOW"] } }).lean();
  assert.deepEqual(
    live.map((row) => row.tokenHash),
    ["live"],
  );
});

it("sorts, skips and limits like MongoDB", async () => {
  const f = rows();
  const ids = async (q: PromiseLike<unknown>) => ((await q) as { _id: string }[]).map((r) => r._id);
  assert.deepEqual(await ids(f.db.Notification.find({}).sort({ n: 1 }).lean()), ["c", "a", "b"]);
  assert.deepEqual(await ids(f.db.Notification.find({}).sort({ n: -1 }).skip(1).limit(1).lean()), [
    "a",
  ]);
  assert.deepEqual(await ids(f.db.Notification.find({}).limit(0).lean()), ["a", "b", "c"]);
});
