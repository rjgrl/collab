import { createDatabase } from "../packages/db/src/index";
import { migrateDatabase } from "../packages/db/src/migration";
import { isManagedLocalDatabase } from "./local-env.mjs";
const url = process.env.DATABASE_URL;
if (!url || !isManagedLocalDatabase(url) || process.env.NODE_ENV === "production")
  throw new Error("Doctor requires the managed development database.");
const target = new URL(url);
target.searchParams.set("serverSelectionTimeoutMS", "5000");
const db = createDatabase({ DATABASE_URL: target.toString() });
let stage = "connection and writable rs0 primary";
try {
  await db.ready();
  const hello = await db.connection.db!.command({ hello: 1 });
  if (hello.setName !== "rs0" || hello.isWritablePrimary !== true) throw new Error("not primary");
  console.log("PASS MongoDB connection and writable rs0 primary.");
  stage = "seeded roles and permissions";
  if (!(await db.Role.countDocuments()) || !(await db.Permission.countDocuments()))
    throw new Error("not seeded");
  stage = "read-only collection/index inspection";
  const report = await migrateDatabase(db);
  if (report.conflicts.length || report.indexes.some((index) => index.state !== "present"))
    throw new Error("schema review required");
  console.log(
    "PASS seeded roles/permissions and all required indexes, including partial unique alumni linking.",
  );
  console.log(
    "Read-only doctor complete; transaction rollback, provider delivery and production readiness require separate acceptance.",
  );
} catch {
  console.error(
    `Database diagnostic failed at ${stage}. Review docs/TROUBLESHOOTING.md. No credentials or driver diagnostics printed; no changes made.`,
  );
  process.exitCode = 1;
} finally {
  await db.disconnect();
}
