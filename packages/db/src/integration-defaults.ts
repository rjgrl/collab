import type { Database } from "./index";
import { integrationKeySchema } from "@Alumni-Tracking-Ss/contracts/integrations";

export interface IntegrationDefaultsReport {
  state: "pending" | "applied" | "rolled-back";
  reason?: string;
  keysAdded?: string[];
  keysRemoved?: string[];
}

export async function createIntegrationDefaults(
  db: Database,
  mode: "dry-run" | "apply" | "rollback",
): Promise<IntegrationDefaultsReport> {
  const integrationKeys = integrationKeySchema.options;
  const existingRows = await db.IntegrationSetting.find({}).lean().exec();
  const existingKeys = new Set(existingRows.map((row: any) => row.key));

  if (mode === "dry-run") {
    const keysToAdd = integrationKeys.filter((key: string) => !existingKeys.has(key));
    const isExistingDb =
      (await db.User.countDocuments().exec()) > 0 ||
      (await db.IntegrationSetting.countDocuments().exec()) > 0;

    if (!isExistingDb) {
      return { state: "pending", reason: "Fresh database; no defaults will be added" };
    }

    return {
      state: "pending",
      keysAdded: keysToAdd,
      reason: keysToAdd.length
        ? `Would add explicit defaults for ${keysToAdd.length} keys`
        : "All keys already have rows",
    };
  }

  if (mode === "apply") {
    const isExistingDb =
      (await db.User.countDocuments().exec()) > 0 ||
      (await db.IntegrationSetting.countDocuments().exec()) > 0;

    if (!isExistingDb) {
      return { state: "applied", keysAdded: [], reason: "Fresh database; no defaults added" };
    }

    const keysToAdd = integrationKeys.filter((key: string) => !existingKeys.has(key));
    const rowsToInsert = keysToAdd.map((key: string) => ({
      key,
      enabled: key !== "google_forms",
      notes: "Explicit default added by migration",
      updatedAt: new Date(),
    }));

    if (rowsToInsert.length > 0) {
      try {
        await db.IntegrationSetting.insertMany(rowsToInsert);
      } catch (error) {
        // Only ignore duplicate-key errors (code 11000)
        if ((error as any)?.code === 11000) {
          // Silently ignore: another instance may have inserted these rows
        } else {
          // Rethrow all other errors
          throw error;
        }
      }
    }

    return { state: "applied", keysAdded: keysToAdd };
  }

  if (mode === "rollback") {
    const removable = existingRows.filter(
      (row) => row.notes === "Explicit default added by migration" && !row.credentials,
    );
    await db.IntegrationSetting.deleteMany({
      notes: "Explicit default added by migration",
      credentials: { $exists: false },
    }).exec();

    return { state: "rolled-back", keysRemoved: removable.map((row) => row.key) };
  }

  return { state: "pending" };
}
