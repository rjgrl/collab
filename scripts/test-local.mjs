import { runTool } from "./local-tools.mjs";
runTool(
  "tsx",
  "tsx",
  [
    "--test",
    "packages/contracts/src/*.test.ts",
    "apps/web/src/utils/*.test.ts",
    "packages/db/src/*.test.ts",
    "packages/api/src/**/*.test.ts",
    "apps/server/src/*.test.ts",
    "scripts/*.test.mjs",
  ],
  {
    env: { ...process.env, NODE_ENV: "test", PASSWORD_BREACH_CHECK: "local" },
  },
).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
