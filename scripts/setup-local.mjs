import { prepareLocalEnv } from "./local-env.mjs";
import { projectRoot, runTool, runTsx } from "./local-tools.mjs";
import { checkToolchain } from "./development.mjs";

async function main() {
  checkToolchain();
  const unknown = process.argv
    .slice(2)
    .filter((arg) => !["--demo", "--update-existing"].includes(arg));
  if (unknown.length) throw new Error("Usage: pnpm setup:local [--demo] [--update-existing]");
  const config = await prepareLocalEnv(projectRoot, { demo: process.argv.includes("--demo") });
  const env = {
    ...process.env,
    NODE_ENV: "development",
    DATABASE_URL: config.databaseUrl,
    SEED_ADMIN_EMAIL: config.email,
    SEED_ADMIN_PASSWORD: config.password,
    SEED_DEMO_DATA: config.demo ? "true" : "false",
    LOCAL_SETUP_UPDATE_EXISTING: process.argv.includes("--update-existing") ? "true" : "false",
  };
  console.log(
    "Preparing local configuration. Existing nonempty values are preserved; existing database updates require --update-existing.",
  );
  for (const directory of ["apps/web", "apps/server", "packages/db"])
    await runTool("varlock", "varlock", ["codegen", "--path", directory], { env });
  await runTsx("local-mongo.ts", { env });
  await runTsx("initialize-local-db.ts", { env });
  await runTsx("verify-local-setup.ts", { env });
  console.log("Local setup complete. Open http://localhost:3001 after running pnpm dev.");
  console.log("Your private initial login is in " + config.loginFile);
  console.log("Compass connection: mongodb://127.0.0.1:27018/?replicaSet=rs0");
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
