// Bounded, in-process synthetic HTTP benchmark. No listener, real DB or provider.
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { createApp } from "./app";
import supertest from "supertest";

if (process.env.NODE_ENV === "production") throw new Error("Use an isolated local test process.");
const app = createApp({
  db: {} as Database,
  config: { nodeEnv: "test", origin: "https://app.example.test" },
  integrationEnv: {},
});
const cases = [
  { name: "liveness", path: "/health/live", init: {}, status: 200 },
  { name: "public session inspection", path: "/api/auth/me", init: {}, status: 200 },
  { name: "anonymous private evidence", path: "/api/files/synthetic", init: {}, status: 401 },
  {
    name: "rejected cookie mutation",
    path: "/api/auth/logout",
    init: { method: "POST", headers: { Cookie: "ats_session=synthetic" } },
    status: 403,
  },
];
const samples = 250;
const concurrency = 10;
for (const scenario of cases) {
  const durations: number[] = [];
  const send = async () => {
    const start = performance.now();
    const pending =
      "method" in scenario.init && scenario.init.method === "POST"
        ? supertest(app).post(scenario.path)
        : supertest(app).get(scenario.path);
    const response = await ("headers" in scenario.init
      ? pending.set(scenario.init.headers ?? {})
      : pending);
    assert.equal(response.status, scenario.status, scenario.name);
    durations.push(performance.now() - start);
  };
  for (let warmup = 0; warmup < 20; warmup++) await send();
  durations.length = 0;
  let cursor = 0;
  const start = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor++ < samples) await send();
    }),
  );
  const elapsedMs = performance.now() - start;
  durations.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      scenario: scenario.name,
      samples,
      concurrency,
      elapsedMs: Number(elapsedMs.toFixed(2)),
      p50Ms: Number(durations[Math.ceil(samples * 0.5) - 1]!.toFixed(2)),
      p95Ms: Number(durations[Math.ceil(samples * 0.95) - 1]!.toFixed(2)),
      rssMiB: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
    }),
  );
}
