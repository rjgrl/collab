import assert from "node:assert/strict";
import { it } from "node:test";
import { TimestampConflictError, timestampRead, timestampWrite } from "./timestamp-ordering";

it("timestamp reads reject an older transaction than the last committed writer", () => {
  assert.throws(
    () => timestampRead({ readTimestamp: 5, writeTimestamp: 10 }, 9),
    TimestampConflictError,
  );
  assert.deepEqual(timestampRead({ readTimestamp: 5, writeTimestamp: 10 }, 10), {
    readTimestamp: 10,
    writeTimestamp: 10,
  });
});

it("a later participating read prevents an older write even without a new write", () => {
  const initial = { readTimestamp: 0, writeTimestamp: 0 };
  const afterOlderRead = timestampRead(initial, 10);
  const afterNewerRead = timestampRead(afterOlderRead, 11);
  assert.throws(() => timestampWrite(afterNewerRead, 10), TimestampConflictError);
  assert.deepEqual(timestampWrite(afterNewerRead, 11), { readTimestamp: 11, writeTimestamp: 11 });
  assert.deepEqual(initial, { readTimestamp: 0, writeTimestamp: 0 });
});

it("an older write is rejected rather than silently skipped after a newer write", () => {
  assert.throws(
    () => timestampWrite({ readTimestamp: 0, writeTimestamp: 12 }, 11),
    TimestampConflictError,
  );
  assert.deepEqual(timestampWrite({ readTimestamp: 9, writeTimestamp: 12 }, 13), {
    readTimestamp: 9,
    writeTimestamp: 13,
  });
});

it("read timestamps only advance and equal-timestamp operations obey the same rules", () => {
  assert.deepEqual(timestampRead({ readTimestamp: 15, writeTimestamp: 8 }, 12), {
    readTimestamp: 15,
    writeTimestamp: 8,
  });
  assert.deepEqual(timestampWrite({ readTimestamp: 15, writeTimestamp: 15 }, 15), {
    readTimestamp: 15,
    writeTimestamp: 15,
  });
});

it("ordering never accepts invalid or imprecise transaction timestamps", () => {
  for (const timestamp of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => timestampRead({ readTimestamp: 0, writeTimestamp: 0 }, timestamp));
    assert.throws(() => timestampWrite({ readTimestamp: 0, writeTimestamp: 0 }, timestamp));
  }
});
