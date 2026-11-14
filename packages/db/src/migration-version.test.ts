import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { it } from "node:test";
import { SCHEMA_VERSION } from "./migration";

// Each accepted migration pipeline has a schema version. A change to migrateDatabase fails this
// test until the author deliberately increments SCHEMA_VERSION and records the new reviewed hash.
const reviewedPipelineHashes: Record<number, string> = {
  1: "5b35e1fa66454dfa1dac60d52932979797642ac174a00028a7d7fcb80c6f5044",
  // 2: Viewer renamed to Alumni; Staff and Admin roles removed (retire-roles.ts).
  2: "f8c691cc14806b91a68d05f6b7885790b08480d0cf2944eead0906032f543cd7",
};

it("requires a schema-version bump whenever the migration pipeline changes", async () => {
  const source = await readFile(fileURLToPath(new URL("./migration.ts", import.meta.url)), "utf8");
  const start = source.indexOf("export async function migrateDatabase(");
  assert.notEqual(start, -1);
  const pipeline = source.slice(start).replace(/\s+/g, " ");
  const actual = createHash("sha256").update(pipeline).digest("hex");
  assert.equal(
    actual,
    reviewedPipelineHashes[SCHEMA_VERSION],
    `migrateDatabase changed without a reviewed SCHEMA_VERSION bump (current ${SCHEMA_VERSION}, hash ${actual})`,
  );
  assert.equal(
    SCHEMA_VERSION,
    Math.max(...Object.keys(reviewedPipelineHashes).map(Number)),
    "SCHEMA_VERSION must be the latest reviewed migration pipeline",
  );
});
