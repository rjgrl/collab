import { createPrismaClient } from "../packages/db/src/index";
import { isManagedLocalDatabase } from "./local-env.mjs";

const url = process.env.DATABASE_URL;
if (!url || !isManagedLocalDatabase(url) || process.env.NODE_ENV === "production")
  throw Error("Doctor requires the managed development database.");
const target = new URL(url);
target.searchParams.set("serverSelectionTimeoutMS", "5000");
const db = createPrismaClient({ DATABASE_URL: target.toString() });
let stage = "connection and writable rs0 primary";
try {
  const hello = await db.$runCommandRaw({ hello: 1 });
  if (hello.setName !== "rs0" || hello.isWritablePrimary !== true) throw Error("not primary");
  console.log("PASS MongoDB connection and writable rs0 primary.");
  stage = "seeded roles and permissions";
  const roles = await db.role.count();
  const permissions = await db.permission.count();
  if (!roles || !permissions) throw Error("not seeded");
  console.log("PASS seeded roles and permissions.");
  stage = "Forms receipt unique index";
  const indexes = await db.$runCommandRaw({ listIndexes: "FormsReceipt" });
  const entries = (indexes.cursor as { firstBatch: { name: string; unique?: boolean }[] })
    .firstBatch;
  if (!entries.some((entry) => entry.name === "FormsReceipt_keyHash_key" && entry.unique))
    throw Error("index missing");
  console.log(
    "PASS MongoDB connection, writable rs0 primary, seeded roles/permissions and Forms receipt unique index.",
  );
  console.log(
    "Read-only doctor complete. It does not prove transaction rollback, provider delivery, firewall or production readiness.",
  );
} catch {
  console.error(
    "Database diagnostic failed at " +
      stage +
      ". Review docs/TROUBLESHOOTING.md; no credentials or driver diagnostics printed. Doctor made no changes.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
