import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { percentTracked } from "./dashboard";

describe("percentTracked", () => {
  it("returns 0 when there are no graduates", () => {
    assert.equal(percentTracked(0, 0), 0);
    assert.equal(percentTracked(0, 10), 0);
  });

  it("uses tracked / graduates * 100", () => {
    assert.equal(percentTracked(14750, 10000), 67.8);
    assert.equal(percentTracked(4, 1), 25);
    assert.equal(percentTracked(3, 1), 33.33);
  });
});
