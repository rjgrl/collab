import type { Database } from "./index";
import {
  open,
  seal,
  keyFingerprint as getKeyFingerprint,
  credentialAad,
  type SealedValue,
} from "./secret-box";

export interface RotationReport {
  keysRotated: string[];
  credentialsCount: number;
  dryRun?: boolean;
}

export async function rotateIntegrationKey(
  db: Database,
  oldKey: Buffer,
  newKey: Buffer,
  options: { dryRun?: boolean } = {},
): Promise<RotationReport> {
  if (oldKey.toString("hex").toLowerCase() === newKey.toString("hex").toLowerCase()) {
    throw new Error("Old and new keys must be different");
  }

  if (options.dryRun) {
    // In dry-run, read and validate without updating
    return db.transaction(async (tx) => {
      const rows = await tx.IntegrationSetting.find({ credentials: { $exists: true } }).exec();
      const keysRotated: string[] = [];
      let credentialsCount = 0;

      for (const row of rows) {
        try {
          // Verify the old key matches the fingerprint
          if (row.keyFingerprint !== getKeyFingerprint(oldKey)) {
            throw new Error("Key fingerprint mismatch");
          }

          // Try to open each credential
          for (const [fieldName, sealed] of Object.entries(row.credentials || {})) {
            const aad = credentialAad(row.key, fieldName);
            open(oldKey, aad, sealed as SealedValue);
          }

          keysRotated.push(row.key);
          credentialsCount += Object.keys(row.credentials || {}).length;
        } catch {
          throw new Error("Cannot open credentials with old key; rotation aborted");
        }
      }

      return { keysRotated, credentialsCount, dryRun: true };
    });
  }

  // Apply rotation in a transaction
  return db.transaction(async (tx) => {
    const rows = await tx.IntegrationSetting.find({ credentials: { $exists: true } }).exec();
    const updatedKeys: string[] = [];
    let totalCount = 0;

    for (const row of rows) {
      try {
        // Verify the old key matches
        if (row.keyFingerprint !== getKeyFingerprint(oldKey)) {
          throw new Error("Key fingerprint mismatch");
        }

        const newCredentials: Record<string, SealedValue> = {};

        // Re-seal each credential with new key
        for (const [fieldName, sealed] of Object.entries(row.credentials || {})) {
          const aad = credentialAad(row.key, fieldName);
          const plaintext = open(oldKey, aad, sealed as SealedValue);
          newCredentials[fieldName] = seal(newKey, aad, plaintext);
        }

        // Update the row with new key's fingerprint
        await tx.IntegrationSetting.findOneAndUpdate(
          { _id: row._id },
          {
            $set: {
              credentials: newCredentials,
              keyFingerprint: getKeyFingerprint(newKey),
            },
          },
        ).exec();

        updatedKeys.push(row.key);
        totalCount += Object.keys(newCredentials).length;
      } catch {
        // Abort the whole transaction on any error
        throw new Error("Cannot rotate credentials; transaction aborted");
      }
    }

    return { keysRotated: updatedKeys, credentialsCount: totalCount };
  });
}
