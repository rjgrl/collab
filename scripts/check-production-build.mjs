import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const dist = new URL("../apps/web/dist/", import.meta.url);
const html = await readFile(new URL("index.html", dist), "utf8");
assert.ok(!html.includes("/@vite/client"), "Development Vite client must not ship.");
const assets = await readdir(new URL("assets/", dist));
const developmentChunks = assets.filter((name) =>
  /DevtoolsComponent|FloatingTanStackRouterDevtools|jsx-dev-runtime/.test(name),
);
assert.deepEqual(developmentChunks, [], "Development runtime/tooling chunks must not ship.");
console.log(
  "Built web artifact contains no Vite development client or known development runtime/tooling chunks. This is a targeted artifact check, not a complete bundle security scan.",
);
