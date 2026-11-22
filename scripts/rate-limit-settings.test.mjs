import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "node:test";
import {
  NUMERIC_LIMITS,
  REFERENCE_MARKER,
  addRateLimitReference,
  effectiveRateLimits,
} from "./rate-limit-settings.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sources = await Promise.all(
  [
    "apps/server/src/middleware/api-rate-limit.ts",
    "apps/server/src/app.ts",
    "packages/api/src/services/session.ts",
  ].map((file) => readFile(path.join(root, file), "utf8")),
);

it("documented defaults and ranges match the server's boundedSetting calls", () => {
  const code = sources.join("\n");
  for (const { key, fallback, max } of NUMERIC_LIMITS)
    assert.match(
      code,
      new RegExp(`boundedSetting\\(\\s*process\\.env\\.${key},\\s*${fallback},\\s*${max}\\s*\\)`),
      key,
    );
  assert.match(code, /API_RATE_STORE \?\? "mongodb"/);
  assert.match(code, /AUTH_IP_STORE \|\| \(secureCookies \? "mongodb" : "memory"\)/);
});

it("reports defaults, overrides and configuration the server would reject", () => {
  const defaults = effectiveRateLimits({ NODE_ENV: "development" });
  assert.deepEqual(defaults.errors, []);
  assert.equal(defaults.rows.find((row) => row.key === "API_RATE_LIMIT").value, 300);
  assert.equal(defaults.rows.find((row) => row.key === "AUTH_IP_STORE").value, "memory");
  assert.ok(defaults.rows.every((row) => row.source === "default"));
  const overridden = effectiveRateLimits({ AUTH_IP_LIMIT: " 200 ", API_RATE_STORE: "mongodb" });
  assert.deepEqual(
    overridden.rows.find((row) => row.key === "AUTH_IP_LIMIT"),
    {
      key: "AUTH_IP_LIMIT",
      value: 200,
      source: "configured",
      about: NUMERIC_LIMITS.find((item) => item.key === "AUTH_IP_LIMIT").about,
    },
  );
  for (const value of ["0", "1001", "1.5", "lots", " "])
    assert.equal(effectiveRateLimits({ AUTH_IP_LIMIT: value }).errors.length, 1, value);
  assert.equal(effectiveRateLimits({ AUTH_IP_STORE: "redis" }).errors.length, 1);
  assert.equal(effectiveRateLimits({ API_RATE_STORE: "" }).errors.length, 1);
  assert.equal(effectiveRateLimits({ AUTH_IP_STORE: " mongodb " }).errors.length, 1);
  assert.deepEqual(
    effectiveRateLimits({ NODE_ENV: "production", AUTH_IP_STORE: "memory" }).errors,
    [],
  );
  const production = effectiveRateLimits({ NODE_ENV: "production", API_RATE_STORE: "memory" });
  assert.deepEqual(production.errors, ["API_RATE_STORE must be mongodb in production."]);
  assert.equal(production.rows.find((row) => row.key === "AUTH_IP_STORE").value, "mongodb");
});

it("adds only commented reference lines, once, preserving existing settings", async () => {
  const file = path.join(await mkdtemp(path.join(os.tmpdir(), "rate-limits-")), ".env");
  const original = 'DATABASE_URL="mongodb://127.0.0.1:27018/x?replicaSet=rs0"\nAUTH_IP_LIMIT=200';
  await writeFile(file, original);
  assert.equal(await addRateLimitReference(file), true);
  assert.equal(await addRateLimitReference(file), false);
  const text = await readFile(file, "utf8");
  assert.ok(text.startsWith(`${original}\n`));
  assert.equal(text.split(REFERENCE_MARKER).length, 2);
  const added = text.slice(original.length);
  assert.ok(
    added
      .split("\n")
      .filter((line) => line.trim())
      .every((line) => line.startsWith("#")),
    "reference lines must all be comments",
  );
  for (const { key, fallback } of NUMERIC_LIMITS)
    assert.match(added, new RegExp(`# ${key}=${fallback}`));
});
