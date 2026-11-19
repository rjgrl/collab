import { reportBackgroundFailure } from "./background-failure";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { findBrokenReferences, type BrokenReference } from "@Alumni-Tracking-Ss/db/reference-check";
import { writeAudit } from "./audit";
import { notifySuperAdmins } from "./backups/scheduler";

/** Asia/Manila (UTC+8, no daylight saving). The check runs once a night from 03:30 local time. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
export const INTEGRITY_CHECK_TIME = "03:30";

export function integritySlot(now: Date) {
  const local = new Date(now.getTime() + MANILA_OFFSET_MS);
  const [hours, minutes] = INTEGRITY_CHECK_TIME.split(":").map(Number) as [number, number];
  if (local.getUTCHours() * 60 + local.getUTCMinutes() < hours * 60 + minutes) return null;
  return local.toISOString().slice(0, 10);
}

/** Exactly one server instance wins tonight's run (conditional upsert on the slot). */
async function claimIntegritySlot(db: Database, slot: string) {
  try {
    const result = await db.BackupState.updateOne(
      { _id: "integrity", lastSlot: { $ne: slot } },
      { $set: { lastSlot: slot, status: "running", startedAt: new Date() } },
      { upsert: true },
    ).exec();
    return result.modifiedCount === 1 || result.upsertedCount === 1;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

/** One scheduler pass. Returns the findings when this instance ran the check, otherwise null. */
export async function runIntegrityTick(input: {
  db: Database;
  now?: Date;
  find?: (db: Database) => Promise<BrokenReference[]>;
}): Promise<BrokenReference[] | null> {
  const slot = integritySlot(input.now ?? new Date());
  if (!slot || !(await claimIntegritySlot(input.db, slot))) return null;
  let broken: BrokenReference[];
  try {
    broken = await (input.find ?? findBrokenReferences)(input.db);
  } catch {
    await input.db.BackupState.updateOne(
      { _id: "integrity" },
      { $set: { status: "failed", finishedAt: new Date(), error: "The check could not run." } },
    ).exec();
    await notifySuperAdmins(input.db, "The nightly data integrity check could not run.");
    return null;
  }
  const total = broken.reduce((sum, item) => sum + item.count, 0);
  const summary = broken.length
    ? `${total} record(s) point at missing records: ${broken.map((item) => `${item.reference} (${item.count})`).join("; ")}`
    : "No broken references";
  await input.db.BackupState.updateOne(
    { _id: "integrity" },
    {
      $set: {
        status: broken.length ? "problems" : "ok",
        finishedAt: new Date(),
        error: broken.length ? summary : null,
      },
    },
  ).exec();
  if (broken.length) {
    await writeAudit(input.db, {
      action: "integrity.references",
      entity: "database",
      entityId: slot,
      summary,
      metadata: { broken },
    });
    await notifySuperAdmins(
      input.db,
      `Nightly integrity check: ${summary}. Run pnpm db:check-references for details.`,
    );
  }
  return broken;
}

export function startIntegrityScheduler(db: Database) {
  const timer = setInterval(() => {
    void runIntegrityTick({ db }).catch((error: unknown) =>
      reportBackgroundFailure("integrity-check", error, {
        db,
        notify: "The nightly reference check could not run.",
      }),
    );
  }, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
