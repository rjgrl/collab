import assert from "node:assert/strict";
import { it } from "node:test";
import { formatDisplayName, structuredNameSchema, isAlumniAccount, isAdministrator } from "./names";

it("preserves Unicode and compound names and stores the actual custom suffix", () => {
  const names = structuredNameSchema.parse({
    firstName: "  María José ",
    middleName: "",
    lastName: "Dela Cruz-O’Neill",
    suffix: " de la Casa ",
  });
  assert.equal(names.firstName, "María José");
  assert.equal(names.suffix, "de la Casa");
  assert.equal(formatDisplayName(names), "María José Dela Cruz-O’Neill de la Casa");
  assert.equal(
    formatDisplayName(structuredNameSchema.parse({ firstName: "李", lastName: "王" })),
    "李 王",
  );
});

it("omits optional name parts, rejects blank required parts and enforces bounds", () => {
  assert.equal(
    formatDisplayName({ firstName: " Ana ", middleName: " ", lastName: " Reyes ", suffix: " " }),
    "Ana Reyes",
  );
  for (const changes of [
    { firstName: " " },
    { lastName: " " },
    { firstName: "A".repeat(81) },
    { suffix: "X".repeat(31) },
    { firstName: "A\nB" },
  ]) {
    assert.equal(
      structuredNameSchema.safeParse({ firstName: "Ana", lastName: "Reyes", ...changes }).success,
      false,
    );
  }
});

it("preserves legacy display names until both structured names are confirmed", () => {
  const name = "Dr. María de la Cruz III";
  assert.equal(formatDisplayName({ name }), name);
  assert.equal(formatDisplayName({ name, firstName: "María" }), name);
  assert.equal(
    formatDisplayName({ name, firstName: "María", lastName: "de la Cruz", suffix: "III" }),
    "María de la Cruz III",
  );
});

it("identifies Alumni and keeps Administrator policy for mixed roles", () => {
  assert.equal(isAlumniAccount({ roles: ["alumni"] }), true);
  // The removed "viewer" key is not an Alumni role any more (migration renames it).
  assert.equal(isAlumniAccount({ roles: ["viewer"] }), false);
  assert.equal(isAlumniAccount({ roles: ["faculty", "alumni"] }), false);
  assert.equal(isAlumniAccount({ roles: ["super_admin", "alumni"] }), false);
  assert.equal(isAdministrator({ roles: ["super_admin"] }), true);
  // Only super_admin administers: a custom role keyed "admin" (or "staff") grants nothing.
  for (const roles of [["admin"], ["alumni", "admin"], ["access_manager", "admin"], ["staff"]])
    assert.equal(isAdministrator({ roles }), false, roles.join(","));
  assert.equal(isAdministrator({ roles: ["faculty"] }), false);
});
