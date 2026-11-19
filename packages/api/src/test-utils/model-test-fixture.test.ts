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

it("sorts, skips and limits like MongoDB", async () => {
  const f = rows();
  const ids = async (q: PromiseLike<unknown>) => ((await q) as { _id: string }[]).map((r) => r._id);
  assert.deepEqual(await ids(f.db.Notification.find({}).sort({ n: 1 }).lean()), ["c", "a", "b"]);
  assert.deepEqual(await ids(f.db.Notification.find({}).sort({ n: -1 }).skip(1).limit(1).lean()), [
    "a",
  ]);
  assert.deepEqual(await ids(f.db.Notification.find({}).limit(0).lean()), ["a", "b", "c"]);
});
