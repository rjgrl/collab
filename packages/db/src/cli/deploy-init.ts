import "varlock/auto-load";
import { passwordMeetsPolicy } from "@Alumni-Tracking-Ss/contracts/password-policy";
import { createDatabase } from "../index";
import { migrateDatabase } from "../migration";
import { DEMO_ACCOUNTS, DatabaseNotEmptyError, initializeEmptyDatabase } from "../seed-data";

/**
 * pnpm deploy:init [--demo]
 * One-time setup of an EMPTY hosted database (e.g. a new Atlas cluster): collections, indexes,
 * roles, permissions and the first Super Admin. `--demo` also adds synthetic demo data (refused
 * when NODE_ENV=production). Credentials come from the environment, never the command line.
 */
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--demo")) {
  console.error("Usage: pnpm deploy:init [--demo]");
  process.exit(1);
}
const demo = args.includes("--demo");
const url = process.env.DATABASE_URL;
const email = process.env.SEED_ADMIN_EMAIL?.trim();
const password = process.env.SEED_ADMIN_PASSWORD ?? "";
const problems = [
  !url && "DATABASE_URL is not set (apps/server/.env or the shell environment).",
  !email && "SEED_ADMIN_EMAIL is not set (packages/db/.env or the shell environment).",
  !passwordMeetsPolicy(password) &&
    "SEED_ADMIN_PASSWORD must meet the app's password policy: 15–128 characters with an uppercase letter, a lowercase letter, a number and a special character or space.",
].filter(Boolean);
if (problems.length) {
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
if (demo && process.env.NODE_ENV === "production") {
  console.error(
    "Demo data is refused when NODE_ENV=production; its logins share the admin password.",
  );
  process.exit(1);
}

const db = createDatabase({ DATABASE_URL: url! });
try {
  await db.ready();
  if (await db.User.countDocuments({}).catch(() => 0))
    throw new DatabaseNotEmptyError("This database already has user accounts.");
  const plan = await migrateDatabase(db);
  if (plan.conflicts.length)
    throw new Error("Existing indexes conflict with the schema; review `pnpm db:migrate`.");
  console.log("Creating collections and indexes…");
  const applied = await migrateDatabase(db, "apply");
  if (applied.conflicts.length) throw new Error("A schema conflict appeared during setup.");
  console.log(
    demo ? "Adding roles, the Super Admin and demo data…" : "Adding roles and the Super Admin…",
  );
  await initializeEmptyDatabase(db, { email: email!, password, demo });
  console.log("\nDone. Sign in with SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD.");
  console.log("Next: remove SEED_ADMIN_PASSWORD from the environment and enroll an authenticator.");
  if (demo) {
    console.log(
      "\nDemo logins (same password as the Super Admin; change or remove before real use):",
    );
    for (const account of DEMO_ACCOUNTS)
      console.log(`  ${account.email.padEnd(32)} ${account.role}`);
  }
} catch (error) {
  // Never echo the connection string or credentials.
  console.error(
    error instanceof DatabaseNotEmptyError
      ? `Refused: ${error.message} deploy:init only sets up an empty database; nothing was changed.`
      : `Setup failed: ${error instanceof Error ? error.message.replace(/mongodb(\+srv)?:\/\/\S+/g, "<database>") : "unknown error"}`,
  );
  process.exitCode = 1;
} finally {
  await db.disconnect();
}
