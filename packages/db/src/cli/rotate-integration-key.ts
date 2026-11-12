import "varlock/auto-load";
import { createDatabase } from "../index";
import { parseSecretKey } from "../secret-box";
import { rotateIntegrationKey } from "../integration-key-rotation";

const dryRun = process.argv.includes("--dry-run");
const oldKeyHex = process.env.INTEGRATION_ENCRYPTION_KEY_OLD;
const newKeyHex = process.env.INTEGRATION_ENCRYPTION_KEY_NEW;

if (!oldKeyHex || !newKeyHex) {
  console.error(
    "Error: INTEGRATION_ENCRYPTION_KEY_OLD and INTEGRATION_ENCRYPTION_KEY_NEW must be set",
  );
  console.error(
    "Usage: INTEGRATION_ENCRYPTION_KEY_OLD=... INTEGRATION_ENCRYPTION_KEY_NEW=... [--dry-run]",
  );
  process.exitCode = 1;
  process.exit(1);
}

let oldKey: Buffer;
let newKey: Buffer;

try {
  oldKey = parseSecretKey(oldKeyHex, "INTEGRATION_ENCRYPTION_KEY_OLD");
  newKey = parseSecretKey(newKeyHex, "INTEGRATION_ENCRYPTION_KEY_NEW");
} catch (error) {
  console.error("Error:", error instanceof Error ? error.message : "Invalid keys");
  process.exitCode = 1;
  process.exit(1);
}

if (oldKey.toString("hex").toLowerCase() === newKey.toString("hex").toLowerCase()) {
  console.error(
    "Error: INTEGRATION_ENCRYPTION_KEY_OLD and INTEGRATION_ENCRYPTION_KEY_NEW must be different",
  );
  process.exitCode = 1;
  process.exit(1);
}

const db = createDatabase({ DATABASE_URL: process.env.DATABASE_URL ?? "" });

try {
  await db.ready();
  const report = await rotateIntegrationKey(db, oldKey, newKey, { dryRun });
  if (dryRun) {
    console.log(`[DRY RUN] Would rotate credentials for: ${report.keysRotated.join(", ")}`);
    console.log(`[DRY RUN] Total credentials that would be rotated: ${report.credentialsCount}`);
  } else {
    console.log(`Rotated credentials for: ${report.keysRotated.join(", ")}`);
    console.log(`Total credentials rotated: ${report.credentialsCount}`);
  }
} catch (error) {
  console.error("Rotation failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
} finally {
  await db.disconnect();
}
