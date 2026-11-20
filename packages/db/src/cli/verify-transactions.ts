import "varlock/auto-load";
import { createDatabase } from "../index";

import { verifyTransactionSupport } from "../transactions";

const db = createDatabase(process.env);
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
