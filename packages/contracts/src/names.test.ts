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
  assert.equal(isAlumniAccount({ roles: ["viewer"] }), true);
  assert.equal(isAlumniAccount({ roles: ["alumni"] }), true);
  assert.equal(isAlumniAccount({ roles: ["staff", "viewer"] }), false);
  assert.equal(isAlumniAccount({ roles: ["super_admin", "viewer"] }), false);
  assert.equal(isAdministrator({ roles: ["viewer", "admin"] }), true);
  assert.equal(isAdministrator({ roles: ["staff"] }), false);
});
