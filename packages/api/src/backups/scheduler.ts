import type { Database, BackupStateRecord } from "@Alumni-Tracking-Ss/db";
import { writeAudit } from "../audit";
import {
  createBackup,
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
  const roles = await db.Role.find({ key: "super_admin" }).select("_id").lean().exec();
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
  if (!slot || !(await claimSlot(input.db, slot))) return null;
  if (!(await acquireLock(input.db, input.owner, "backup", 2 * 60 * 60 * 1000))) return null;
  try {
    const entry = await (input.create ?? createBackup)({
      db: input.db,
      config: input.config,
      type: "scheduled",
    });
    await pruneScheduled(input.config, schedule?.retention ?? DEFAULT_SCHEDULE.retention);
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
    void runSchedulerTick({ ...input, owner }).catch(() => undefined);
  }, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
