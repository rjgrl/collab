import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { createPrismaClient } from "../packages/db/src/index";
import { recoverLocalAdministrator } from "../packages/api/src/services/local-recovery";
import { readLocalConfig, isManagedLocalDatabase } from "./local-env.mjs";
import { projectRoot } from "./local-tools.mjs";

async function main() {
  if (process.argv.includes("--help")) {
    console.log(
      "Local MFA recovery: pnpm exec tsx scripts/local-mfa-recovery.ts. Requires an interactive terminal, managed localhost rs0 database, current Super Admin password and explicit confirmation. Revokes all sessions; no HTTP bypass. Never use against production.",
    );
    return;
  }
  const { effective } = await readLocalConfig(projectRoot);
  if (effective.NODE_ENV === "production" || !isManagedLocalDatabase(effective.DATABASE_URL))
    throw new Error("Recovery is limited to the managed local testing database.");
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("Recovery requires an interactive local terminal.");
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, done) {
      if (!muted) process.stdout.write(chunk);
      done();
    },
  });
  const prompt = createInterface({ input: process.stdin, output, terminal: true });
  const db = createPrismaClient({ DATABASE_URL: effective.DATABASE_URL! });
  try {
    const email = (await prompt.question("Local Super Admin email: ")).trim().toLowerCase();
    process.stdout.write("Current account password (hidden): ");
    muted = true;
    const password = await prompt.question("");
    muted = false;
    process.stdout.write("\n");
    const confirmation = await prompt.question(
      "Type RESET MY AUTHENTICATOR to revoke all sessions and require enrollment again: ",
    );
    await recoverLocalAdministrator(db, email, password, confirmation);
    console.log(
      "Local authenticator reset. Sign in and enroll a new authenticator before accessing the application.",
    );
  } finally {
    muted = false;
    prompt.close();
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Recovery failed.");
  process.exitCode = 1;
});
