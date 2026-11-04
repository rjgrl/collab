// One command for every check: static, unit, and the real-database suites on the managed
// local MongoDB (port 27018, rs0). Each suite uses its own throwaway database.
// Usage: pnpm test:all [-- --browser]
import { spawnSync } from "node:child_process";

const browser = process.argv.includes("--browser");
const steps = [
  "check-types",
  "lint",
  "test",
  "check:secrets",
  "test:mongoose-db",
  "test:org-migration",
  "test:scope-local",
  "test:faculty-local",
  "test:contacts-local",
  "test:reports-local",
  "test:completion-db",
  "test:pentest-local",
  "test:staging-local",
  ...(browser ? ["test:browser"] : []),
];

function run(args) {
  // shell: pnpm is a .cmd shim on Windows. Arguments are fixed script names, never user input.
  return spawnSync(`pnpm ${args.join(" ")}`, { stdio: "inherit", shell: true }).status === 0;
}

if (!run(["run", "db:local"])) {
  console.error("MongoDB could not be started; run pnpm setup:local first.");
  process.exit(1);
}
const results = [];
for (const step of steps) {
  console.log(`\n=== ${step} ===`);
  results.push([step, run(["run", step])]);
}
console.log("\nSummary");
for (const [step, ok] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${step}`);
const failed = results.filter(([, ok]) => !ok).length;
if (!browser) console.log("(Browser suite skipped; add -- --browser to include it.)");
process.exitCode = failed ? 1 : 0;
