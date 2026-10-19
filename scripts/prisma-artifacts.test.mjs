import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { copyPrismaEngines } from "./prisma-artifacts.mjs";
it("packages finalized Prisma engines and excludes locked-generation temporary DLLs", async () => {
  const prefix = path.join(os.tmpdir(), "collab-engine-test-");
  const root = await mkdtemp(prefix);
  try {
    const source = path.join(root, "source"),
      target = path.join(root, "target");
    await mkdir(source);
    await mkdir(target);
    await writeFile(path.join(source, "query_engine-windows.dll.node.tmp1234"), "synthetic temp");
    await assert.rejects(() => copyPrismaEngines(source, target), /Generate the Prisma client/);
    await writeFile(path.join(source, "query_engine-windows.dll.node"), "synthetic engine");
    await copyPrismaEngines(source, target);
    assert.deepEqual(await readdir(target), ["query_engine-windows.dll.node"]);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(prefix)));
    await rm(root, { recursive: true });
  }
});
