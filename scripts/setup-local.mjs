import { prepareLocalEnv } from "./local-env.mjs";
import { projectRoot, runTool, runTsx, runWorkspace } from "./local-tools.mjs";

async function main() {
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--demo");
  if (unknown.length) throw new Error("Usage: pnpm setup:local [--demo]");
  const config = await prepareLocalEnv(projectRoot, { demo: process.argv.includes("--demo") });
  const env = {
    ...process.env,
    NODE_ENV: "development",
    DATABASE_URL: config.databaseUrl,
    SEED_ADMIN_EMAIL: config.email,
    SEED_ADMIN_PASSWORD: config.password,
    SEED_DEMO_DATA: config.demo ? "true" : "false",
  };
  console.log("Preparing local configuration. Existing values and database records are preserved.");
  for (const directory of ["apps/web", "apps/server", "packages/db"])
    await runTool("varlock", "varlock", ["codegen", "--path", directory], { env });
  await runWorkspace(["--filter", "@Alumni-Tracking-Ss/db", "db:generate"], { env });
  await runTsx("local-mongo.ts", { env });
  await runWorkspace(["--filter", "@Alumni-Tracking-Ss/db", "db:push"], { env });
  await runWorkspace(["--filter", "@Alumni-Tracking-Ss/db", "db:seed"], { env });
  await runTsx("verify-local-setup.ts", { env });
  console.log("Local setup complete. Open http://localhost:3001 after running pnpm dev.");
  console.log("Your private initial login is in " + config.loginFile);
  console.log("Compass connection: mongodb://127.0.0.1:27018/?replicaSet=rs0");
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
