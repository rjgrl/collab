import { randomBytes } from "node:crypto";
import { SCHEMA_VERSION } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { requireAdministrator } from "@Alumni-Tracking-Ss/api/access";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { writeAudit } from "@Alumni-Tracking-Ss/api/audit";
import { reverifyMfaCode } from "@Alumni-Tracking-Ss/api/services/mfa";
import {
  backupReady,
  createBackup,
  fingerprintOf,
  getBackup,
  importBackup,
  listBackups,
  type BackupConfig,
} from "@Alumni-Tracking-Ss/api/backups/backup-service";
import {
  DEFAULT_SCHEDULE,
  acquireLock,
  releaseLock,
  notifySuperAdmins,
} from "@Alumni-Tracking-Ss/api/backups/scheduler";
import {
  RESTORE_STEPS,
  maintenanceState,
  runRestore,
  setMaintenance,
  type RestoreStep,
} from "@Alumni-Tracking-Ss/api/backups/restore";
import { backupsSchemas } from "@Alumni-Tracking-Ss/contracts/backups";
import type { z } from "zod";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Super Admin with an MFA-verified session, checked on the server for every backup action. */
export function requireBackupAdmin(context: Context) {
  const user = requireAdministrator(context);
  if (user.mfaVerified !== true)
    throw new ApiError("FORBIDDEN", {
      message: "Verify your authenticator before managing backups.",
    });
  return user;
}

async function restoreStatus(context: Context) {
  const row = await context.db.BackupState.findById("restore").lean().exec();
  return {
    status:
      (row?.status as z.infer<typeof backupsSchemas.restoreStatus.output>["status"]) ?? "idle",
    step: row?.step ?? null,
    backupId: row?.backupId ?? null,
    error: row?.error ?? null,
    startedAt: row?.startedAt ?? null,
    finishedAt: row?.finishedAt ?? null,
  };
}

export const backupsService = {
  async overview(context: Context, config: BackupConfig | undefined) {
    requireBackupAdmin(context);
    const schedule = await context.db.BackupState.findById("schedule").lean().exec();
    return {
      configured: backupReady(config),
      running: {
        appVersion: config?.appVersion ?? "unknown",
        schemaVersion: SCHEMA_VERSION,
        keyFingerprints: {
          mfa: fingerprintOf(config?.mfaEncryptionKey),
          integration: fingerprintOf(config?.integrationEncryptionKey),
        },
      },
      schedule: {
        frequency: schedule?.frequency ?? DEFAULT_SCHEDULE.frequency,
        time: schedule?.time ?? DEFAULT_SCHEDULE.time,
        weekday: schedule?.weekday ?? DEFAULT_SCHEDULE.weekday,
        retention: schedule?.retention ?? DEFAULT_SCHEDULE.retention,
      },
      backups: await listBackups(config),
      restore: await restoreStatus(context),
      maintenance: (await maintenanceState(context.db)).active,
    };
  },

  async create(context: Context, config: BackupConfig | undefined) {
    const user = requireBackupAdmin(context);
    const owner = `manual-${randomBytes(6).toString("hex")}`;
    if (!(await acquireLock(context.db, owner, "backup", 2 * 60 * 60 * 1000)))
      throw new ApiError("CONFLICT", { message: "A backup or restore is already running." });
    try {
      const entry = await createBackup({
        db: context.db,
        config,
        type: "manual",
        createdBy: user.name,
      });
      await writeAudit(context.db, {
        actor: user,
        action: "backups.create",
        entity: "backup",
        entityId: entry.backupId,
        summary: `Created manual backup ${entry.backupId}`,
        ipAddress: context.ipAddress,
      });
      return entry;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      await notifySuperAdmins(context.db, `Manual backup by ${user.name} failed: ${reason}`);
      await writeAudit(context.db, {
        actor: user,
        action: "backups.failed",
        entity: "backup",
        entityId: "manual",
        summary: `Manual backup failed: ${error instanceof Error ? error.message : "unknown error"}`,
        ipAddress: context.ipAddress,
      });
      throw error;
    } finally {
      await releaseLock(context.db, owner);
    }
  },

  async import(
    context: Context,
    config: BackupConfig | undefined,
    file: { path: string; originalname: string } | undefined,
  ) {
    const user = requireBackupAdmin(context);
    if (!file) throw new ApiError("BAD_REQUEST", { message: "Select an .atsbak backup file." });
    const entry = await importBackup(config, file.path, file.originalname, user.name);
    await writeAudit(context.db, {
      actor: user,
      action: "backups.import",
      entity: "backup",
      entityId: entry.backupId,
      summary: `Imported and verified backup ${entry.backupId}`,
      ipAddress: context.ipAddress,
    });
    return entry;
  },

  async schedule(context: Context, input: z.input<typeof backupsSchemas.schedule.input>) {
    const user = requireBackupAdmin(context);
    const p = backupsSchemas.schedule.input.parse(input);
    await context.db.BackupState.updateOne(
      { _id: "schedule" },
      {
        $set: { frequency: p.frequency, time: p.time, weekday: p.weekday, retention: p.retention },
      },
      { upsert: true },
    ).exec();
    await writeAudit(context.db, {
      actor: user,
      action: "backups.schedule",
      entity: "backup",
      entityId: "schedule",
      summary:
        p.frequency === "off"
          ? "Turned automatic backups off"
          : `Automatic backups ${p.frequency === "daily" ? "every day" : `every ${WEEKDAYS[p.weekday]}`} at ${p.time} (Asia/Manila), keeping ${p.retention}`,
      ipAddress: context.ipAddress,
    });
    return p;
  },

  async restore(
    context: Context,
    config: BackupConfig | undefined,
    input: z.input<typeof backupsSchemas.restore.input>,
  ) {
    const user = requireBackupAdmin(context);
    const p = backupsSchemas.restore.input.parse(input);
    await reverifyMfaCode(context, p.code);
    const entry = await getBackup(config, p.id);
    if (entry.status !== "succeeded" || !entry.verified || !entry.manifest)
      throw new ApiError("CONFLICT", { message: "Only verified backups can be restored." });
    if (entry.manifest.schemaVersion > SCHEMA_VERSION)
      throw new ApiError("CONFLICT", {
        message: `This backup uses schema version ${entry.manifest.schemaVersion}; this server runs ${SCHEMA_VERSION}. Upgrade the application first.`,
      });
    const mismatched = [
      [
        "MFA_ENCRYPTION_KEY",
        entry.manifest.keyFingerprints.mfa,
        fingerprintOf(config?.mfaEncryptionKey),
      ],
      [
        "INTEGRATION_ENCRYPTION_KEY",
        entry.manifest.keyFingerprints.integration,
        fingerprintOf(config?.integrationEncryptionKey),
      ],
    ].filter(([, saved, running]) => saved && saved !== running);
    if (mismatched.length)
      throw new ApiError("CONFLICT", {
        message: `This backup was made with a different ${mismatched.map(([name]) => name).join(" and ")}. Restored authenticators or integration credentials would be unreadable. Start the server with the original key before restoring.`,
      });
    const owner = `restore-${randomBytes(6).toString("hex")}`;
    if (!(await acquireLock(context.db, owner, "restore", 4 * 60 * 60 * 1000)))
      throw new ApiError("CONFLICT", { message: "A backup or restore is already running." });
    const failAt =
      process.env.NODE_ENV === "test" &&
      RESTORE_STEPS.includes(process.env.BACKUP_TEST_FAIL_STEP as RestoreStep)
        ? (process.env.BACKUP_TEST_FAIL_STEP as RestoreStep)
        : undefined;
    void runRestore({
      db: context.db,
      config,
      backupId: entry.backupId,
      actor: { id: user.id, name: user.name, email: user.email },
      lockOwner: owner,
      failAt,
    }).catch(() => releaseLock(context.db, owner));
    return { started: true as const };
  },

  /** Leaves maintenance mode after an interrupted or failed restore has been checked. */
  async endMaintenance(context: Context) {
    const user = requireBackupAdmin(context);
    if ((await restoreStatus(context)).status === "running")
      throw new ApiError("CONFLICT", { message: "A restore is still running." });
    await setMaintenance(context.db, false);
    await writeAudit(context.db, {
      actor: user,
      action: "backups.maintenance",
      entity: "backup",
      entityId: "maintenance",
      summary: "Ended maintenance mode manually",
      ipAddress: context.ipAddress,
    });
    return { ok: true as const };
  },

  async restoreStatus(context: Context) {
    requireBackupAdmin(context);
    return restoreStatus(context);
  },
};
