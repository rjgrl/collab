import type { Database } from "@Alumni-Tracking-Ss/db";
import {
  readAlumniTimestamps,
  writeAlumniTimestamps,
  reserveTransactionTimestamp,
  TimestampConflictError,
} from "@Alumni-Tracking-Ss/db/timestamp-ordering";
import type { Context } from "../context";

/** Inside the authorized caller's transaction: keep indirect writes in its alumnus ordering boundary. */
export async function protectAlumniWrite(
  db: Database,
  alumniIds: readonly string[],
  issued?: Context["timestampWrite"],
) {
  if (!alumniIds.length) return;
  if (issued && alumniIds.some((id) => !issued.alumniIds.includes(id)))
    throw new TimestampConflictError("scope");
  const stamp = issued?.stamp ?? (await reserveTransactionTimestamp(db));
  await readAlumniTimestamps(db, stamp, alumniIds);
  await writeAlumniTimestamps(db, stamp, alumniIds);
}
