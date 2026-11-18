import "varlock/auto-load";
import { createDatabase } from "../index";
import { findBrokenReferences } from "../reference-check";

// Read-only. Exits 1 when any reference points at a missing document.
const db = createDatabase(process.env);
try {
  const broken = await findBrokenReferences(db);
  console.log(JSON.stringify({ ok: broken.length === 0, broken }, null, 2));
  if (broken.length) process.exitCode = 1;
} catch {
  console.error("Reference check failed; private connection and record details withheld.");
  process.exitCode = 1;
} finally {
  await db.disconnect();
}
