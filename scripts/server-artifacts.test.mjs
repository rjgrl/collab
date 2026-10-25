import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { verifyServerArtifacts } from "./server-artifacts.mjs";

it("rejects missing entrypoints, old native engines and generated-client runtime imports", async () => {
  const prefix = path.join(os.tmpdir(), "collab-artifact-test-");
  const root = await mkdtemp(prefix);
  try {
    await assert.rejects(() => verifyServerArtifacts(root), /Missing server entry/);
    await writeFile(path.join(root, "index.mjs"), 'import mongoose from "mongoose";');
    assert.deepEqual(await verifyServerArtifacts(root), ["index.mjs"]);
    await writeFile(path.join(root, "index.mjs"), 'import "@prisma/client";');
    await assert.rejects(() => verifyServerArtifacts(root), /still depends on Prisma/);
    await writeFile(path.join(root, "index.mjs"), 'import mongoose from "mongoose";');
    const engine = path.join(root, "query_engine-windows.dll.node.tmp1234");
    await writeFile(engine, "synthetic obsolete engine");
    await assert.rejects(() => verifyServerArtifacts(root), /Obsolete Prisma/);
  } finally {
    const resolved = path.resolve(root);
    assert.ok(
      resolved.startsWith(path.resolve(prefix)) &&
        path.dirname(resolved) === path.resolve(os.tmpdir()),
    );
    await rm(root, { recursive: true });
  }
});
