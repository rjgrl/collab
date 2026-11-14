import { reportBackgroundFailure } from "@Alumni-Tracking-Ss/api/background-failure";
import { Server as HttpServer } from "node:http";
import { createApp } from "./app";
import { readIntegrationEnv } from "./context";
import { ENV } from "./env.server";
import { db } from "./services";
import { hasLegacyRoles } from "@Alumni-Tracking-Ss/db";
import { drainAndDisconnect } from "./shutdown";
import { validateRuntimeConfig } from "./runtime-config";
import { staffEmailDomains } from "@Alumni-Tracking-Ss/api/services/staff-domain";
import { readFileSync } from "node:fs";
import type { BackupConfig } from "@Alumni-Tracking-Ss/api/backups/backup-service";
import { startBackupScheduler } from "@Alumni-Tracking-Ss/api/backups/scheduler";
import { startIntegrityScheduler } from "@Alumni-Tracking-Ss/api/integrity";
import { recoverInterruptedRestore } from "@Alumni-Tracking-Ss/api/backups/restore";
const integrationEnv = readIntegrationEnv();
// Fails fast in production when STAFF_EMAIL_DOMAINS is missing or malformed.
if (!staffEmailDomains())
  console.warn(
    "STAFF_EMAIL_DOMAINS is unset: staff email domains are unrestricted (development only).",
  );
const runtime = validateRuntimeConfig({
  nodeEnv: ENV.NODE_ENV,
  origin: ENV.CORS_ORIGIN,
  appUrl: integrationEnv.appUrl,
  databaseUrl: ENV.DATABASE_URL,
  verificationSecret: integrationEnv.verificationSecret,
  mfaEncryptionKey: integrationEnv.mfaEncryptionKey,
  integrationEncryptionKey: integrationEnv.integrationEncryptionKey,
  uploadDir: integrationEnv.uploadDir,
});

const backup: BackupConfig = {
  encryptionKey: process.env.BACKUP_ENCRYPTION_KEY?.trim() || undefined,
  dir: process.env.BACKUP_DIR?.trim() || undefined,
  toolsDir: process.env.MONGODB_TOOLS_DIR?.trim() || undefined,
  databaseUrl: ENV.DATABASE_URL,
  uploadDir: integrationEnv.uploadDir ?? "./uploads",
  appVersion:
    (
      JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
        version?: string;
      }
    ).version ?? "unknown",
  mfaEncryptionKey: integrationEnv.mfaEncryptionKey,
  integrationEncryptionKey: integrationEnv.integrationEncryptionKey,
};
const app = createApp({
  backup,
  db,
  config: {
    nodeEnv: ENV.NODE_ENV,
    origin: ENV.CORS_ORIGIN,
    trustedProxyIps: runtime.trustedProxyIps,
  },
  integrationEnv,
});
await db.ready();
// Roles renamed or removed by schema version 2 must be migrated before serving requests: an
// unmigrated "viewer" role would no longer be recognised as Alumni.
if (await hasLegacyRoles(db)) {
  console.error(
    "Legacy roles (viewer, admin or staff) are still in the database. Back up, then run `pnpm db:migrate --dry-run` and `pnpm db:migrate --apply` before starting the server.",
  );
  process.exit(1);
}
// A restore whose process died is detected at start and then every minute (heartbeat-based, so a
// restore still running on another instance is never touched).
const recoverRestore = () =>
  recoverInterruptedRestore(db).catch((error: unknown) =>
    reportBackgroundFailure("restore-recovery", error, {
      db,
      notify: "Checking for an interrupted backup restore failed.",
    }),
  );
await recoverRestore();
setInterval(() => void recoverRestore(), 60_000).unref();
startBackupScheduler({ db, config: backup });
// Nightly (03:30 Asia/Manila) scan for references to missing records; notifies Super Admins.
startIntegrityScheduler(db);
const server = app.listen(
  Number(process.env.PORT) || 3000,
  process.env.HOST?.trim() || "127.0.0.1",
  () => {
    console.log("Server listening on port " + (Number(process.env.PORT) || 3000));
  },
);
let stopping = false;
if (server instanceof HttpServer) {
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void drainAndDisconnect(
      () =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
      () => db.disconnect(),
      () => {
        if ("closeAllConnections" in server && typeof server.closeAllConnections === "function")
          server.closeAllConnections();
      },
    ).catch(() => {
      console.error(JSON.stringify({ event: "shutdown_failed" }));
      process.exitCode = 1;
    });
  });
