import assert from "node:assert/strict";
import { it } from "node:test";
import { checkToolchain, requireSetupConsent } from "./development.mjs";
it("fails early for incompatible Node or package manager without guessing versions", () => {
  assert.throws(() => checkToolchain({ node: "20.19.0" }), /Node.js/);
  assert.throws(() => checkToolchain({ node: "26.10.0", agent: "pnpm/10.0.0 npm/?" }), /12.5.1/);
  checkToolchain({ node: "26.10.0", agent: "pnpm/12.5.1 npm/? node/v26.10.0" });
});
it("requires explicit consent before existing database schema/seed updates", () => {
  assert.equal(requireSetupConsent({ hasCollections: true, updateExisting: false }), "verify-only");
  assert.equal(requireSetupConsent({ hasCollections: false, updateExisting: false }), "initialize");
  assert.equal(requireSetupConsent({ hasCollections: true, updateExisting: true }), "initialize");
});
