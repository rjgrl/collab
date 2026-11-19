import { reportBackgroundFailure } from "../background-failure";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { migrateDatabase } from "@Alumni-Tracking-Ss/db/migration";
import { writeAudit } from "../audit";
import { applyBackup, createBackup, failureReason, type BackupConfig } from "./backup-service";
import { releaseLock } from "./scheduler";

export const RESTORE_STEPS = [
  "pre-restore backup",
  "maintenance mode",
  "database",
  "files",
  "migrations",
  "sessions",
  "finish",
] as const;
export type RestoreStep = (typeof RESTORE_STEPS)[number];
/** A running restore refreshes this often; recovery treats it as dead after RESTORE_STALE_MS. */
export const RESTORE_HEARTBEAT_MS = 30_000;
export const RESTORE_STALE_MS = 5 * 60_000;
const MAINTENANCE_MESSAGE =
  "The system is being restored from a backup. Please try again in a few minutes.";

let maintenanceCache: { active: boolean; message: string; until: number } | null = null;

/** Maintenance state lives in the BackupState collection, which a restore never touches. */
export async function setMaintenance(db: Database, active: boolean) {
  await db.BackupState.updateOne(
    { _id: "maintenance" },
    { $set: { active, message: MAINTENANCE_MESSAGE } },
    { upsert: true },
  ).exec();
  maintenanceCache = { active, message: MAINTENANCE_MESSAGE, until: Date.now() + 2000 };
}

export async function maintenanceState(db: Database) {
  if (maintenanceCache && maintenanceCache.until > Date.now()) return maintenanceCache;
  const row = await db.BackupState.findById("maintenance").lean().exec();
  maintenanceCache = {
    active: Boolean(row?.active),
    message: row?.message ?? MAINTENANCE_MESSAGE,
    until: Date.now() + 2000,
  };
  return maintenanceCache;
}

async function setStatus(db: Database, fields: Record<string, unknown>) {
  await db.BackupState.updateOne({ _id: "restore" }, { $set: fields }, { upsert: true }).exec();
}

async function appendRestoreLog(config: BackupConfig | undefined, entry: Record<string, unknown>) {
  if (config?.dir)
    await appendFile(path.join(config.dir, "restore-log.jsonl"), `${JSON.stringify(entry)}\n`, {
      mode: 0o600,
    });
}

/**
 * Restores `backupId` over the live database. Order: verified pre-restore backup, maintenance mode
 * (non-Super-Admin API → 503), mongorestore --drop, file swap, migrations, session invalidation.
 * Any failure restores the pre-restore backup; if that also fails, maintenance mode stays on.
 * Preconditions (MFA, RESTORE confirmation, versions, key fingerprints, lock) are the caller's.
 */
export async function runRestore(input: {
  db: Database;
  config: BackupConfig | undefined;
  backupId: string;
  actor: { id: string; name: string; email: string };
  lockOwner: string;
  failAt?: RestoreStep;
}) {
  const { db, config, backupId, actor } = input;
  const startedAt = new Date();
  let step: RestoreStep = "pre-restore backup";
  const enter = async (next: RestoreStep) => {
    step = next;
    await setStatus(db, { status: "running", step, backupId });
    if (input.failAt === next) throw new Error(`Restore stopped at ${next} for a test.`);
  };
  await setStatus(db, {
    status: "running",
    step,
    backupId,
    startedAt,
    finishedAt: null,
    error: null,
    owner: actor.name,
    lockOwner: input.lockOwner,
    heartbeatAt: startedAt,
  });
  // Proves to other server instances that this restore is alive (see recoverInterruptedRestore).
  const heartbeat = setInterval(() => {
    void setStatus(db, { heartbeatAt: new Date() }).catch((error: unknown) =>
      reportBackgroundFailure("restore-heartbeat", error),
    );
  }, RESTORE_HEARTBEAT_MS);
  heartbeat.unref?.();
  await appendRestoreLog(config, {
    event: "restore.start",
    backupId,
    actor: actor.email,
    startedAt,
  });
  let preRestoreId: string | null = null;
  let result:
    | "restored"
    | "rolled back"
    | "stopped before any change"
    | "failed; maintenance mode is still on";
  let failedStep: RestoreStep | null = null;
  let reason: string | null = null;
  let rollbackReason: string | null = null;
  try {
    await enter("pre-restore backup");
    preRestoreId = (await createBackup({ db, config, type: "pre-restore", createdBy: actor.name }))
      .backupId;
    await enter("maintenance mode");
    await setMaintenance(db, true);
    await applyBackup(db, config, backupId, (name) => enter(name));
    await enter("migrations");
    await migrateDatabase(db, "apply");
    await enter("sessions");
    await db.Session.deleteMany({}).exec();
    await enter("finish");
    await setMaintenance(db, false);
    result = "restored";
  } catch (error) {
    failedStep = step;
    reason = failureReason(error);
    console.error(JSON.stringify({ event: "restore_failed", backupId, step, reason }));
    if (!preRestoreId) {
      // The pre-restore backup failed, so nothing was changed and maintenance was never entered.
      result = "stopped before any change";
    } else {
      try {
        await setMaintenance(db, true);
        await applyBackup(db, config, preRestoreId, async () => undefined);
        await migrateDatabase(db, "apply");
        await db.Session.deleteMany({}).exec();
        await setMaintenance(db, false);
        result = "rolled back";
      } catch (error) {
        rollbackReason = failureReason(error);
        console.error(
          JSON.stringify({
            event: "restore_rollback_failed",
            backupId,
            preRestoreId,
            reason: rollbackReason,
          }),
        );
        result = "failed; maintenance mode is still on";
      }
    }
  }
  clearInterval(heartbeat);
  const finishedAt = new Date();
  const summary =
    result === "restored"
      ? `Restored backup ${backupId} (started ${startedAt.toISOString()}, finished ${finishedAt.toISOString()})`
      : `Restore of backup ${backupId} failed at "${failedStep}" (started ${startedAt.toISOString()}, finished ${finishedAt.toISOString()}); ${result}`;
  await appendRestoreLog(config, {
    event: "restore.finish",
    backupId,
    actor: actor.email,
    startedAt,
    finishedAt,
    result,
    failedStep,
    reason,
    rollbackReason,
    preRestoreId,
  });
  await setStatus(db, {
    status:
      result === "restored"
        ? "succeeded"
        : result === "rolled back"
          ? "rolled-back"
          : result === "stopped before any change"
            ? "stopped"
            : "failed",
    step: failedStep ?? "finish",
    error: failedStep
      ? `Failed at step: ${failedStep}. ${reason ?? ""}${rollbackReason ? ` Rollback also failed: ${rollbackReason}` : ""}`.trim()
      : null,
    finishedAt,
  });
  // The audit log was just replaced by the restore, so the record is written afterwards too.
  await writeAudit(db, {
    actor,
    action: "backups.restore",
    entity: "backup",
    entityId: backupId,
    summary,
    metadata: { preRestoreBackupId: preRestoreId, result, failedStep, reason, rollbackReason },
  }).catch((error: unknown) => reportBackgroundFailure("restore-audit", error));
  await releaseLock(db, input.lockOwner);
  return { result, failedStep, preRestoreId };
}

/**
 * Called at server start. A restore is only treated as interrupted when its heartbeat is older
 * than RESTORE_STALE_MS, so another instance starting mid-restore never breaks a live one. The
 * stale restore is marked failed (conditionally, so two starting instances cannot both act), its
 * own lock is released, and maintenance mode is left exactly as it was.
 */
export async function recoverInterruptedRestore(db: Database, now = new Date()) {
  const staleBefore = new Date(now.getTime() - RESTORE_STALE_MS);
  const row = await db.BackupState.findById("restore").lean().exec();
  if (row?.status !== "running") return false;
  const lastSeen = row.heartbeatAt ?? row.startedAt;
  if (lastSeen && lastSeen.getTime() >= staleBefore.getTime()) return false;
  const claimed = await db.BackupState.updateOne(
    { _id: "restore", status: "running", heartbeatAt: row.heartbeatAt ?? null },
    {
      $set: {
        status: "failed",
        error: `The server stopped during the restore (step: ${row.step ?? "unknown"}). Check the data, then restore the pre-restore backup or end maintenance mode.`,
        finishedAt: now,
      },
    },
  ).exec();
  if (claimed.modifiedCount !== 1) return false;
  if (row.lockOwner)
    await db.BackupState.updateOne(
      { _id: "lock", owner: row.lockOwner },
      { $set: { lockedUntil: new Date(0) } },
    ).exec();
  return true;
}
