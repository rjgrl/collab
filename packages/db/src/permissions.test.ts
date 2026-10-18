import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { PERMISSION_KEYS, ROLE_PRESETS } from "./permissions";

describe("RBAC catalog", () => {
  it("has unique permission keys", () => {
    assert.equal(new Set(PERMISSION_KEYS).size, PERMISSION_KEYS.length);
  });

  it("assigns only known keys to role presets", () => {
    const known = new Set(PERMISSION_KEYS);
    for (const role of Object.values(ROLE_PRESETS)) {
      for (const key of role.permissions) {
        assert.equal(known.has(key), true, `${role.key} has unknown permission ${key}`);
      }
    }
  });
});
