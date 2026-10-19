import assert from "node:assert/strict";
import { it } from "node:test";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { importAlumniRows } from "./importer";

const row = {
  studentNumber: "SYNTHETIC-1",
  firstName: "Test",
  lastName: "Member",
  gender: "Female",
  departmentCode: "COT",
  programCode: "BSIT",
};

it("hides unexpected database errors from import results", async () => {
  const db = {
    department: {
      findFirst: async () => {
        throw new Error("synthetic-database-private-path-and-query");
      },
    },
  } as unknown as Database;
  const result = await importAlumniRows(db, [row]);
  assert.equal(result.successCount, 0);
  assert.equal(result.errorCount, 1);
  assert.deepEqual(result.errors, [
    { row: 1, message: "Unable to import row. Try again or contact an administrator." },
  ]);
});

it("preserves actionable domain and schema validation errors in import results", async () => {
  const db = { department: { findFirst: async () => null } } as unknown as Database;
  const result = await importAlumniRows(db, [row, { ...row, gender: "" }]);
  assert.equal(result.errorCount, 2);
  assert.equal(result.errors[0]?.message, "Unknown department code: COT");
  assert.match(result.errors[1]!.message, /Male|Female/);
});
