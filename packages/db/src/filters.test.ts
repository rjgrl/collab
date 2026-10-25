import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { notDeleted, notDeletedFilter, withNotDeleted } from "./filters";

describe("withNotDeleted", () => {
  it("includes unset MongoDB deletedAt fields", () => {
    assert.deepEqual(notDeleted, { deletedAt: null });
  });

  it("returns the base filter when no extra where is provided", () => {
    assert.deepEqual(withNotDeleted(), notDeletedFilter());
    assert.deepEqual(withNotDeleted({}), notDeletedFilter());
  });

  it("combines extra filters with AND so search OR cannot overwrite deletedAt", () => {
    const where = withNotDeleted({
      $or: [{ name: /IT/ }],
    });
    assert.deepEqual(where, {
      $and: [notDeleted, { $or: [{ name: /IT/ }] }],
    });
  });
});
