import { randomUUID } from "node:crypto";
import type { Database } from "./index";

export async function verifyTransactionSupport(db: Database) {
  const marker = `transaction-probe-${randomUUID()}`;
  const rollback = new Error(marker);
  try {
    await db.transaction(async (tx) => {
      await new tx.AuditLog({ action: "database.transaction.probe", entity: marker }).save();
      await tx.transaction(async (nested) => {
        const found = await nested.AuditLog.findOne({ entity: marker }).lean();
        if (!found) throw new Error("Nested transaction did not reuse the active scope");
      });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  if (await db.AuditLog.exists({ entity: marker }))
    throw new Error("Transaction rollback probe persisted unexpectedly");
}
