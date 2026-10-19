import path from "node:path";
import { projectRoot, runTool } from "./local-tools.mjs";

// A developer's private NODE_ENV must not ship React development/debug builds.
runTool("vite-plus", "vp", ["build", ...process.argv.slice(2)], {
  cwd: path.join(projectRoot, "apps/web"),
  env: { ...process.env, NODE_ENV: "production" },
}).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
