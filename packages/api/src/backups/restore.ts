import { appendFile } from "node:fs/promises";
import path from "node:path";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { migrateDatabase } from "@Alumni-Tracking-Ss/db/migration";
import { writeAudit } from "../audit";
import { applyBackup, createBackup, type BackupConfig } from "./backup-service";
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
  });
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
  } catch {
    failedStep = step;
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
      } catch {
        result = "failed; maintenance mode is still on";
      }
    }
  }
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
    error: failedStep ? `Failed at step: ${failedStep}` : null,
    finishedAt,
  });
  // The audit log was just replaced by the restore, so the record is written afterwards too.
  await writeAudit(db, {
    actor,
    action: "backups.restore",
    entity: "backup",
    entityId: backupId,
    summary,
    metadata: { preRestoreBackupId: preRestoreId, result, failedStep },
  }).catch(() => undefined);
  await releaseLock(db, input.lockOwner);
  return { result, failedStep, preRestoreId };
}

/**
 * Called once at server start: a restore that was "running" cannot still be running in a fresh
 * process, so mark it failed, release the lock, and leave maintenance mode exactly as it was.
 */
export async function recoverInterruptedRestore(db: Database) {
  const row = await db.BackupState.findById("restore").lean().exec();
  if (row?.status !== "running") return false;
  await setStatus(db, {
    status: "failed",
    error: `The server stopped during the restore (step: ${row.step ?? "unknown"}). Check the data, then restore the pre-restore backup or end maintenance mode.`,
    finishedAt: new Date(),
  });
  await db.BackupState.updateOne(
    { _id: "lock", kind: "restore" },
    { $set: { lockedUntil: new Date(0) } },
  ).exec();
  return true;
}
