import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { projectRoot } from "./local-tools.mjs";
const dist = path.join(projectRoot, "apps/server/dist");
const files = await readdir(dist);
assert.ok(files.includes("index.mjs"), "Missing server entry artifact");
const engines = files.filter((name) => /^(libquery_engine-|query_engine-)/.test(name));
assert.ok(engines.length > 0, "Missing native Prisma engine");
for (const name of engines) {
  assert.match(name, /\.node$/, "Temporary/incomplete Prisma engine in artifact");
  const digest = async (file) =>
    createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  assert.equal(
    await digest(path.join(dist, name)),
    await digest(path.join(projectRoot, "packages/db/prisma/generated", name)),
    "Native engine differs from generated client engine",
  );
}
console.log(
  "Server entry and finalized Prisma engine hashes verified; not a full deployment/dependency certification.",
);
