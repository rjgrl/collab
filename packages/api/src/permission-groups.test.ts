import assert from "node:assert/strict";
import { it } from "node:test";
import { groupPermissions, groupState, togglePermissions } from "./permission-groups";

it("groups each permission once using the persisted module", () => {
  const groups = groupPermissions([
    { id: "a", key: "files.read", module: "files", name: "Read", description: "" },
    { id: "b", key: "roles.read", module: "rbac", name: "Roles", description: "" },
  ]);
  assert.deepEqual(
    groups.map((group) => group.items.map((item) => item.id)),
    [["a"], ["b"]],
  );
});
it("enables and disables a group without changing other groups", () => {
  assert.deepEqual(togglePermissions(["outside"], ["a", "b"], true), ["outside", "a", "b"]);
  assert.deepEqual(togglePermissions(["outside", "a", "b"], ["a", "b"], false), ["outside"]);
});
it("individual changes produce accessible mixed, all and empty states", () => {
  const ids = ["a", "b"];
  assert.deepEqual(groupState(ids, []), { checked: false, indeterminate: false, count: 0 });
  const selected = togglePermissions([], ["a"], true);
  assert.deepEqual(groupState(ids, selected), { checked: false, indeterminate: true, count: 1 });
  assert.deepEqual(groupState(ids, togglePermissions(selected, ["b"], true)), {
    checked: true,
    indeterminate: false,
    count: 2,
  });
  assert.equal(groupState([], []).checked, false);
});
