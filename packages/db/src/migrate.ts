import "varlock/auto-load";
import { createDatabase } from "./index";
import { migrateDatabase, type MigrationMode } from "./migration";
const args = process.argv.slice(2);
if (args.length > 1 || args.some((arg) => !["--dry-run", "--apply", "--rollback"].includes(arg)))
  throw new Error("Usage: db:migrate [--dry-run|--apply|--rollback]");
const mode: MigrationMode =
  args[0] === "--apply" ? "apply" : args[0] === "--rollback" ? "rollback" : "dry-run";
if (!process.env.DATABASE_URL)
  throw new Error("Configure DATABASE_URL privately before migration inspection");
const db = createDatabase({ DATABASE_URL: process.env.DATABASE_URL });
try {
  const report = await migrateDatabase(db, mode);
  console.log(JSON.stringify(report, null, 2));
  if (report.conflicts.length) process.exitCode = 1;
} catch {
  console.error(
    "Database migration failed. Connection details and record values withheld. Review index conflicts and operator configuration privately; records remain untouched; Department_code_key may have been retired after its definition was saved in MigrationIndexBackup.",
  );
  process.exitCode = 1;
} finally {
  await db.disconnect();
}
