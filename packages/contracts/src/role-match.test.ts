import assert from "node:assert/strict";
import { it } from "node:test";
import { matchingRoles } from "./role-match";

const known = ["a", "b", "c", "d"];
const roles = [
  { id: "reader", permissions: ["a"] },
  { id: "editor", permissions: ["b", "a"] },
  { id: "editor-copy", permissions: ["a", "b"] },
  { id: "legacy", permissions: ["c", "retired.key"] },
  { id: "empty", permissions: [] },
];
const ids = (selected: string[]) => matchingRoles(selected, roles, known).map((role) => role.id);

it("matches regardless of order and returns every exact match", () => {
  assert.deepEqual(ids(["a", "b"]), ["editor", "editor-copy"]);
  assert.deepEqual(ids(["b", "a", "a"]), ["editor", "editor-copy"]);
});

it("requires set equality, not a subset or superset", () => {
  assert.deepEqual(ids(["a", "b", "c"]), []);
  assert.deepEqual(ids(["b"]), []);
  assert.deepEqual(ids(["a"]), ["reader"]);
});

it("ignores retired or unknown permissions on both sides", () => {
  assert.deepEqual(ids(["c"]), ["legacy"]);
  assert.deepEqual(ids(["c", "unknown.key"]), ["legacy"]);
});

it("matches an empty selection only to roles without known permissions", () => {
  assert.deepEqual(ids([]), ["empty"]);
});
