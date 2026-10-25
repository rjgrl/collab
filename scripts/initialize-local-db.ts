import { createDatabase } from "../packages/db/src/index";
import { migrateDatabase } from "../packages/db/src/migration";
import { isManagedLocalDatabase } from "./local-env.mjs";
import { requireSetupConsent } from "./development.mjs";
import { runWorkspace } from "./local-tools.mjs";
const url = process.env.DATABASE_URL;
if (process.env.NODE_ENV === "production" || !url || !isManagedLocalDatabase(url))
  throw new Error("Initialization requires a managed nonproduction database.");
const db = createDatabase({ DATABASE_URL: url });
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
    if (report.indexes.some((index) => index.state !== "present"))
      throw new Error(
        "Existing local schema needs review. Back it up, review pnpm db:migrate, then explicitly run pnpm setup:local --update-existing. No records were changed.",
      );
    console.log("Existing database verified: no schema/index/seed changes made.");
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
        SEED_DEMO_DATA: !hasCollections && process.env.SEED_DEMO_DATA === "true" ? "true" : "false",
      },
    });
  }
} finally {
  await db.disconnect();
}
