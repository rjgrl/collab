import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createDatabase } from "../packages/db/src/index";
import { DEMO_ACCOUNTS } from "../packages/db/src/seed-data";
import { migrateDatabase } from "../packages/db/src/migration";
import { isManagedLocalDatabase } from "./local-env.mjs";
import { requireSetupConsent } from "./development.mjs";
import { runWorkspace } from "./local-tools.mjs";
const url = process.env.DATABASE_URL;
if (process.env.NODE_ENV === "production" || !url || !isManagedLocalDatabase(url))
  throw new Error("Initialization requires a managed nonproduction database.");
const db = createDatabase({ DATABASE_URL: url });
const demo = process.env.SEED_DEMO_DATA === "true";
try {
  const report = await migrateDatabase(db);
  const hasCollections = report.collections.length > 0;
  const action = requireSetupConsent({
    hasCollections,
    updateExisting: process.env.LOCAL_SETUP_UPDATE_EXISTING === "true",
  });
  if (report.conflicts.length)
    throw new Error(
      "Existing indexes or duplicate records conflict with the required schema. Review the dry-run migration privately; no records were changed.",
    );
  if (action === "verify-only") {
    // A pending College/Department restructure must be applied before the app can run.
    if (
      report.indexes.some((index) => index.state !== "present") ||
      report.orgStructure?.state === "pending"
    )
      throw new Error(
        "Existing local schema needs review. Back it up, review pnpm db:migrate, then explicitly run pnpm setup:local --update-existing. No records were changed.",
      );
    console.log("Existing database verified: no schema/index changes made.");
    if (demo) {
      // Demo records are synthetic @collab.test data and every write is an idempotent upsert.
      console.log("Adding any missing demo data and demo logins.");
      await runWorkspace(["--filter", "@Alumni-Tracking-Ss/db", "db:seed"], {
        env: { ...process.env, SEED_DEMO_DATA: "true" },
      });
    }
  } else {
    console.log(
      hasCollections
        ? "Applying explicitly approved additive local schema/seed update."
        : "Initializing this checkout's new development database.",
    );
    const applied = await migrateDatabase(db, "apply");
    if (applied.conflicts.length)
      throw new Error("Concurrent schema conflict; no seed changes were made.");
    await runWorkspace(["--filter", "@Alumni-Tracking-Ss/db", "db:seed"], {
      env: {
        ...process.env,
        SEED_DEMO_DATA: demo ? "true" : "false",
      },
    });
  }
  if (demo) await writeDemoLogins();
} finally {
  await db.disconnect();
}

/** Lists every demo sign-in under the administrator login; earlier lists are replaced. */
async function writeDemoLogins() {
  const file = fileURLToPath(new URL("../.tools/local-login.txt", import.meta.url));
  const marker = "--- Demo accounts";
  const current = existsSync(file) ? await readFile(file, "utf8") : "";
  const base = current.includes(marker) ? current.slice(0, current.indexOf(marker)) : current;
  const lines = DEMO_ACCOUNTS.map((account) => `${account.email.padEnd(32)} ${account.role}`);
  const text = [
    base.trimEnd(),
    "",
    `${marker} (password: the administrator's initial password above) ---`,
    ...lines,
    "Development/testing only. Remove the demo seed before deployment.",
    "",
  ].join("\n");
  await writeFile(file, text, { mode: 0o600 });
}
