import { createPrismaClient } from "../packages/db/src/index";
import { isManagedLocalDatabase } from "./local-env.mjs";
import { requireSetupConsent } from "./development.mjs";
import { runWorkspace } from "./local-tools.mjs";
const url = process.env.DATABASE_URL;
if (process.env.NODE_ENV === "production" || !url || !isManagedLocalDatabase(url))
  throw Error("Initialization requires a managed nonproduction database.");
const db = createPrismaClient({ DATABASE_URL: url });
try {
  const listing = await db.$runCommandRaw({ listCollections: 1, nameOnly: true });
  const hasCollections = (listing.cursor as { firstBatch: unknown[] }).firstBatch.length > 0;
  const action = requireSetupConsent({
    hasCollections,
    updateExisting: process.env.LOCAL_SETUP_UPDATE_EXISTING === "true",
  });
  if (action === "verify-only") {
    console.log("Existing database detected: no schema/index/seed changes will be made.");
    try {
      const indexes = await db.$runCommandRaw({ listIndexes: "FormsReceipt" });
      const keys = (indexes.cursor as { firstBatch: { name: string; unique?: boolean }[] })
        .firstBatch;
      if (!keys.some((x) => x.name === "FormsReceipt_keyHash_key" && x.unique))
        throw Error("index missing");
    } catch {
      throw Error(
        "Existing local schema needs review. Back it up, review changes, then explicitly run pnpm setup:local --update-existing. No records were changed.",
      );
    }
  } else {
    console.log(
      hasCollections
        ? "Applying explicitly approved local schema/seed update."
        : "Initializing this checkout's new development database.",
    );
    await runWorkspace(["--filter", "@Alumni-Tracking-Ss/db", "db:push"]);
    await runWorkspace(["--filter", "@Alumni-Tracking-Ss/db", "db:seed"]);
  }
} finally {
  await db.$disconnect();
}
