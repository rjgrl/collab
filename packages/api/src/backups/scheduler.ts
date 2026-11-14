import { reportBackgroundFailure } from "../background-failure";
import { ROLE } from "@Alumni-Tracking-Ss/contracts/names";
import type { Database, BackupStateRecord } from "@Alumni-Tracking-Ss/db";
import { writeAudit } from "../audit";
import {
  createBackup,
  listBackups,
  pruneScheduled,
  type BackupConfig,
  type CatalogEntry,
} from "./backup-service";

/** Asia/Manila is UTC+8 all year (no daylight saving time). */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
export type BackupSchedule = Pick<
  BackupStateRecord,
  "frequency" | "time" | "weekday" | "retention"
>;
export const DEFAULT_SCHEDULE = {
  frequency: "off",
  time: "02:00",
  weekday: 0,
  retention: 7,
} as const;

/** The schedule slot that is due at `now` (local Manila time), or null. */
export function dueSlot(schedule: BackupSchedule | null | undefined, now: Date): string | null {
  if (!schedule?.frequency || schedule.frequency === "off" || !schedule.time) return null;
  const local = new Date(now.getTime() + MANILA_OFFSET_MS);
  const [hours, minutes] = schedule.time.split(":").map(Number) as [number, number];
  if (schedule.frequency === "weekly" && local.getUTCDay() !== (schedule.weekday ?? 0)) return null;
  if (local.getUTCHours() * 60 + local.getUTCMinutes() < hours * 60 + minutes) return null;
  return `${local.toISOString().slice(0, 10)}T${schedule.time}`;
}

/** Exactly one caller wins a slot: the conditional update is atomic in MongoDB. */
export async function claimSlot(db: Database, slot: string) {
  const result = await db.BackupState.updateOne(
    { _id: "schedule", lastSlot: { $ne: slot } },
    { $set: { lastSlot: slot } },
  ).exec();
  return result.modifiedCount === 1;
}

/** Single backup/restore lock across server instances; expires after `ttlMs`. */
export async function acquireLock(
  db: Database,
  owner: string,
  kind: "backup" | "restore",
  ttlMs: number,
) {
  const now = new Date();
  try {
    const row = await db.BackupState.findOneAndUpdate(
      { _id: "lock", $or: [{ lockedUntil: { $lt: now } }, { lockedUntil: { $exists: false } }] },
      { $set: { owner, kind, lockedUntil: new Date(now.getTime() + ttlMs) } },
      { upsert: true, returnDocument: "after" },
    ).exec();
    return row?.owner === owner;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

export async function releaseLock(db: Database, owner: string) {
  await db.BackupState.updateOne(
    { _id: "lock", owner },
    { $set: { lockedUntil: new Date(0) } },
  ).exec();
}

/** Inserts one notification per active Super Admin (failures of unattended jobs). */
export async function notifySuperAdmins(db: Database, summary: string) {
  const roles = await db.Role.find({ key: ROLE.superAdmin }).select("_id").lean().exec();
  const links = await db.UserRole.find({ roleId: { $in: roles.map((role) => role._id) } })
    .select("userId")
    .lean()
    .exec();
  const users = await db.User.find({
    _id: { $in: links.map((link) => link.userId) },
    status: "active",
  })
    .select("_id")
    .lean()
    .exec();
  if (users.length)
    await db.Notification.insertMany(
      users.map((user) => ({ recipientId: user._id, summary, readAt: null })),
      { ordered: true },
    );
}

/** Hours a schedule may go without a successful backup before it counts as stale. */
export const FRESHNESS_HOURS = { daily: 26, weekly: 7 * 24 + 2 } as const;

export type BackupFreshness = {
  lastSuccessAt: string | null;
  lastSuccessId: string | null;
  allowedHours: number | null;
  stale: boolean;
};

/**
 * Whether the newest successful backup is recent enough for the schedule. Counted from the later
 * of that backup and the moment the schedule was last saved, so turning a schedule on does not
 * alert before its first run.
 */
export function backupFreshness(
  schedule: (BackupSchedule & { scheduleChangedAt?: Date | null }) | null | undefined,
  entries: CatalogEntry[],
  now: Date,
): BackupFreshness {
  const last = entries.find((entry) => entry.status === "succeeded" && entry.verified) ?? null;
  const frequency = schedule?.frequency;
  const allowedHours =
    frequency === "daily" || frequency === "weekly" ? FRESHNESS_HOURS[frequency] : null;
  const since = Math.max(
    last ? Date.parse(last.createdAt) : 0,
    schedule?.scheduleChangedAt ? new Date(schedule.scheduleChangedAt).getTime() : 0,
  );
  return {
    lastSuccessAt: last?.createdAt ?? null,
    lastSuccessId: last?.backupId ?? null,
    allowedHours,
    stale: allowedHours !== null && now.getTime() - since > allowedHours * 3_600_000,
  };
}

/**
 * Alerts Super Admins once per stale episode (keyed by the newest good backup), across all
 * instances: the conditional update lets exactly one instance send it.
 */
export async function checkBackupFreshness(input: {
  db: Database;
  config: BackupConfig | undefined;
  now?: Date;
}) {
  if (!input.config?.dir) return null;
  const schedule = await input.db.BackupState.findById("schedule").lean().exec();
  const status = backupFreshness(
    schedule,
    await listBackups(input.config),
    input.now ?? new Date(),
  );
  if (!status.stale) return status;
  const key = `stale:${status.lastSuccessId ?? "none"}`;
  const claimed = await input.db.BackupState.updateOne(
    { _id: "schedule", staleAlertedFor: { $ne: key } },
    { $set: { staleAlertedFor: key } },
    { timestamps: false },
  ).exec();
  if (claimed.modifiedCount !== 1) return status;
  const summary = status.lastSuccessAt
    ? `No successful backup since ${status.lastSuccessAt}; the ${schedule?.frequency} schedule expects one within ${status.allowedHours} hours.`
    : `No successful backup yet; the ${schedule?.frequency} schedule expects one within ${status.allowedHours} hours.`;
  await writeAudit(input.db, {
    action: "backups.stale",
    entity: "backup",
    entityId: status.lastSuccessId ?? "none",
    summary,
  });
  await notifySuperAdmins(input.db, `Backups are out of date. ${summary}`);
  return status;
}

/** One scheduler pass: claim the due slot, lock, back up, prune; failures notify and audit. */
export async function runSchedulerTick(input: {
  db: Database;
  config: BackupConfig | undefined;
  now?: Date;
  owner: string;
  create?: typeof createBackup;
}): Promise<CatalogEntry | null> {
  const schedule = await input.db.BackupState.findById("schedule").lean().exec();
  const slot = dueSlot(schedule, input.now ?? new Date());
  if (!slot) return null;
  // Lock first, then claim: if a manual backup or restore holds the lock, the slot stays unclaimed
  // and the next minute's tick retries it (dueSlot keeps returning it for the rest of the day).
  if (!(await acquireLock(input.db, input.owner, "backup", 2 * 60 * 60 * 1000))) return null;
  if (!(await claimSlot(input.db, slot))) {
    await releaseLock(input.db, input.owner);
    return null;
  }
  try {
    const entry = await (input.create ?? createBackup)({
      db: input.db,
      config: input.config,
      type: "scheduled",
    });
    await pruneScheduled(input.config, schedule?.retention ?? DEFAULT_SCHEDULE.retention);
    if (entry.offHost === "failed")
      await notifySuperAdmins(
        input.db,
        `Scheduled backup ${entry.backupId} was saved locally but the Google Drive copy failed.`,
      );
    return entry;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    await writeAudit(input.db, {
      action: "backups.failed",
      entity: "backup",
      entityId: slot,
      summary: `Scheduled backup for ${slot} failed: ${reason}`,
    });
    await notifySuperAdmins(input.db, `Scheduled backup failed: ${reason}`);
    return null;
  } finally {
    await releaseLock(input.db, input.owner);
  }
}

export function startBackupScheduler(input: { db: Database; config: BackupConfig | undefined }) {
  const owner = `scheduler-${process.pid}-${Math.random().toString(16).slice(2)}`;
  const timer = setInterval(() => {
    void runSchedulerTick({ ...input, owner })
      .then(() => checkBackupFreshness(input))
      .catch((error: unknown) =>
        reportBackgroundFailure("backup-scheduler", error, {
          db: input.db,
          notify: "The backup scheduler could not run; scheduled backups may be missing.",
        }),
      );
  }, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
