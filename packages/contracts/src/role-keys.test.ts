import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "node:test";

// A typed-out role key is how the removed "admin" alias kept granting administrator access.
// Role keys are compared only through ROLE and the helpers in names.ts.
const root = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const sources = [
  "apps/server/src",
  "apps/web/src",
  "packages/api/src",
  "packages/db/src",
  "packages/contracts/src",
  "packages/ui/src",
];
const keys = "super_admin|faculty|alumni|admin|staff|viewer";
const patterns = [
  String.raw`roles\??\.(includes|indexOf)\(\s*"(${keys})"`,
  String.raw`\b(role|current|preset)\.key\s*[!=]==?\s*"(${keys})"`,
  String.raw`\bRole\.(find|findOne|exists|updateOne|deleteOne)\(\s*\{\s*key:\s*"(${keys})"`,
  String.raw`\(role\)\s*=>\s*role\s*[!=]==?\s*"(${keys})"`,
  String.raw`"roles\.key":\s*\{[^}]*"(${keys})"`,
].map((source) => new RegExp(source));

async function* files(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== "dist") yield* files(full);
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.test\.tsx?$|routeTree\.gen\.ts$/.test(entry.name)
    )
      yield full;
  }
}

it("compares role keys only through ROLE and the role helpers", async () => {
  const offenders: string[] = [];
  for (const dir of sources)
    for await (const file of files(path.join(root, dir))) {
      if (file.endsWith(path.join("contracts", "src", "names.ts"))) continue;
      const lines = (await readFile(file, "utf8")).split("\n");
      lines.forEach((line, index) => {
        if (patterns.some((pattern) => pattern.test(line)))
          offenders.push(`${path.relative(root, file)}:${index + 1}: ${line.trim()}`);
      });
    }
  assert.deepEqual(offenders, [], "Use ROLE.* or isAdministrator/isFacultyAccount/isAlumniAccount");
});
