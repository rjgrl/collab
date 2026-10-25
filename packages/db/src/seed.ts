import "varlock/auto-load";
import { createDatabase } from "./index";
import { seedDatabase } from "./seed-data";

const db = createDatabase({ DATABASE_URL: process.env.DATABASE_URL ?? "" });
try {
  await db.ready();
  await seedDatabase(db);
} catch {
  console.error("Development seeding failed; private account and connection details withheld.");
  process.exitCode = 1;
} finally {
  await db.disconnect();
}
