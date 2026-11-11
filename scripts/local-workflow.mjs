import { existsSync } from "node:fs";
import path from "node:path";
import { isManagedLocalDatabase, readLocalConfig } from "./local-env.mjs";
import { projectRoot, runTsx, runWorkspace } from "./local-tools.mjs";

async function main() {
  const command = process.argv[2];
  if (
    ![
      "dev",
      "dev:server",
      "db:migrate",
      "db:verify-transactions",
      "db:seed",
      "db:local",
      "db:rotate-integration-key",
      "db:check-references",
    ].includes(command)
  )
    throw new Error("Unsupported local workflow command.");
  if (!existsSync(path.join(projectRoot, "packages/db/node_modules/mongoose/package.json")))
    throw new Error(
      "Mongoose is missing. Run pnpm install --frozen-lockfile and pnpm setup:local.",
    );
  const { effective } = await readLocalConfig(projectRoot);
  if (command === "db:local" && effective.NODE_ENV === "production")
    throw new Error("db:local is for development only.");
  if (!effective.DATABASE_URL)
    throw new Error(
      "DATABASE_URL is missing. Run pnpm setup:local or configure your custom database privately.",
    );
  if (
    command === "db:local" ||
    (effective.NODE_ENV !== "production" && isManagedLocalDatabase(effective.DATABASE_URL))
  )
    await runTsx("local-mongo.ts");
  if (command === "db:local") return;
  const args =
    command === "dev"
      ? ["--filter", "web", "--filter", "server", "dev"]
      : command === "dev:server"
        ? ["--filter", "server", "dev"]
        : ["--filter", "@Alumni-Tracking-Ss/db", command];
  // The dev seed copies integration credentials from apps/server/.env into the database once,
  // so it needs the server's variables (INTEGRATION_ENCRYPTION_KEY and provider keys).
  await runWorkspace(
    [...args, ...process.argv.slice(3)],
    command === "db:seed" ? { env: { ...effective, ...process.env } } : undefined,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
