import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const child = spawn(process.execPath, ["dist/index.mjs"], {
  cwd: fileURLToPath(new URL("../apps/server/", import.meta.url)),
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: "3210",
    CORS_ORIGIN: "https://smoke.example.test",
    APP_URL: "https://smoke.example.test",
    DATABASE_URL:
      "mongodb://127.0.0.1:9/collab_smoke?serverSelectionTimeoutMS=100&connectTimeoutMS=100",
  },
  stdio: "ignore",
  windowsHide: true,
});
const exited = once(child, "exit");
try {
  let live;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) throw new Error("Built server exited before becoming live.");
    try {
      live = await fetch("http://127.0.0.1:3210/health/live");
      if (live.ok) break;
    } catch {
      /* wait for local startup */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(live?.status, 200);
  const ready = await fetch("http://127.0.0.1:3210/health/ready");
  assert.equal(ready.status, 503);
  assert.deepEqual(await ready.json(), { ok: false });
  assert.equal((await fetch("http://127.0.0.1:3210/api/files/synthetic")).status, 401);
  console.log(
    "Built production server: live=200, unavailable synthetic DB readiness=503, anonymous file=401.",
  );
} finally {
  child.kill();
  await exited;
}
