import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function verifyServerArtifacts(directory) {
  const files = await readdir(directory);
  assert.ok(files.includes("index.mjs"), "Missing server entry artifact");
  assert.ok(
    !files.some((name) => /(?:libquery_engine-|query_engine-|prisma)/i.test(name)),
    "Obsolete Prisma/native-engine artifact in Mongoose build",
  );
  for (const name of files.filter((file) => /\.(?:mjs|cjs|js)$/.test(file))) {
    const contents = await readFile(path.join(directory, name), "utf8");
    assert.ok(
      !/@prisma\/client|prisma[\\/]generated|(?:libquery_engine-|query_engine-)/.test(contents),
      "Server artifact still depends on Prisma/generated engines",
    );
  }
  return files;
}
