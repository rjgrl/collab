import "varlock/auto-load";
import { createDatabase } from "./index";

import { verifyTransactionSupport } from "./transactions";

if (!process.env.DATABASE_URL)
  throw new Error("Configure DATABASE_URL privately before the rollback-only transaction probe");
const db = createDatabase({ DATABASE_URL: process.env.DATABASE_URL });
try {
  await verifyTransactionSupport(db);
  console.log(
    "PASS real transaction visibility, nested scope reuse and rollback; no probe records persisted.",
  );
} catch {
  console.error("Transaction support verification failed; private driver diagnostics withheld.");
  process.exitCode = 1;
} finally {
  await db.disconnect();
}
