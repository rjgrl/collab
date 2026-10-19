import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import net from "node:net";
import path from "node:path";
import { checkToolchain } from "./development.mjs";
import { readLocalConfig, isManagedLocalDatabase } from "./local-env.mjs";
import { projectRoot, runTsx } from "./local-tools.mjs";

async function portAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}
async function main() {
  checkToolchain();
  console.log("PASS Node/pnpm versions. Diagnostics are read-only; no provider requests are sent.");
  for (const file of [
    "node_modules/tsx/package.json",
    "packages/db/prisma/generated/client.ts",
    "apps/server/.env",
    "apps/web/.env",
    "packages/db/.env",
  ]) {
    if (!existsSync(path.join(projectRoot, file)))
      throw Error(
        "Missing " + file + "; run pnpm install --frozen-lockfile, then pnpm setup:local.",
      );
  }
  const config = await readLocalConfig(projectRoot);
  if (
    config.effective.NODE_ENV === "production" ||
    !isManagedLocalDatabase(config.effective.DATABASE_URL)
  )
    throw Error(
      "Doctor checks only the managed loopback development database. Review private configuration; no values were printed.",
    );
  for (const key of ["SESSION_SECRET", "MFA_ENCRYPTION_KEY"]) {
    if (!config.effective[key]) throw Error("Missing " + key + "; run pnpm setup:local.");
  }
  for (const port of [3000, 3001])
    console.log(
      ((await portAvailable(port)) ? "PASS available" : "INFO occupied") +
        " loopback IPv4 port " +
        port +
        ". Stop only your own app before starting a second instance.",
    );
  const uploads = path.resolve(
    projectRoot,
    "apps/server",
    config.effective.UPLOAD_DIR || "./uploads",
  );
  try {
    await access(uploads, constants.R_OK | constants.W_OK);
    console.log("PASS upload directory readable/writable (OS access check).");
  } catch {
    console.log(
      "INFO upload directory absent or not accessible; upload writes require permission. First upload creates the default directory.",
    );
  }
  console.log(
    "INFO optional Google/mail credentials present: " +
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SMTP_URL"]
        .map((key) => key + "=" + Boolean(config.effective[key]))
        .join(", ") +
      ". Presence does not verify delivery or enablement; SMS remains disconnected.",
  );
  await runTsx("doctor-db.ts", {
    env: { ...process.env, ...config.effective, NODE_ENV: "development" },
  });
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
