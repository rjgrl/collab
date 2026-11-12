import "varlock/auto-load";
import { createDatabase } from "../index";
import { findBrokenReferences } from "../reference-check";

// Read-only. Exits 1 when any reference points at a missing document.
if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL privately first.");
const db = createDatabase({ DATABASE_URL: process.env.DATABASE_URL });
try {
  const broken = await findBrokenReferences(db);
  console.log(JSON.stringify({ ok: broken.length === 0, broken }, null, 2));
  if (broken.length) process.exitCode = 1;
} finally {
  await db.disconnect();
}
