import { randomBytes } from "node:crypto";
import { mkdirSync, statfsSync } from "node:fs";
import path from "node:path";
import { Router, type RequestHandler } from "express";
import multer from "multer";
import {
  MAX_IMPORT_BYTES,
  backupReady,
  type BackupConfig,
} from "@Alumni-Tracking-Ss/api/backups/backup-service";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { backupsSchemas } from "@Alumni-Tracking-Ss/contracts/backups";
import { authenticate } from "../../middleware/authenticate";
import { requestContext } from "../../middleware/request-context";
import { backupsService, requireBackupAdmin } from "./service";

/** Backup routes receive the server-only backup configuration; it never reaches the browser. */
export function backupsRoutes(config: BackupConfig | undefined) {
  const routes = Router();
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_request, _file, done) => {
        const directory = path.join(config!.dir!, ".imports");
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        done(null, directory);
      },
      filename: (_request, _file, done) =>
        done(null, `${Date.now()}-${randomBytes(8).toString("hex")}.upload`),
    }),
    limits: { fileSize: MAX_IMPORT_BYTES, files: 1, fields: 0, parts: 1 },
  });
  const importPreflight: RequestHandler = (request, _response, next) => {
    requireBackupAdmin(requestContext(request));
    const ready = backupReady(config);
    if (!ready.encryptionKey || !ready.dir || !ready.tools)
      throw new ApiError("SERVICE_UNAVAILABLE", {
        message:
          "Backups need BACKUP_ENCRYPTION_KEY, an absolute BACKUP_DIR and MONGODB_TOOLS_DIR on the server.",
      });
    // Refuse before reading the body: unknown or oversized uploads, or not enough disk for the
    // upload plus its catalog copy.
    const declared = Number(request.get("content-length"));
    if (!Number.isFinite(declared) || declared <= 0)
      throw new ApiError("BAD_REQUEST", { message: "Select an .atsbak backup file." });
    if (declared > MAX_IMPORT_BYTES)
      throw new ApiError("PAYLOAD_TOO_LARGE", { message: "Backup files are limited to 20 GB." });
    const disk = statfsSync(config!.dir!);
    if (disk.bavail * disk.bsize < declared * 2 + 512 * 1024 * 1024)
      throw new ApiError("INSUFFICIENT_STORAGE", {
        message: "The backup folder does not have enough free space for this file.",
      });
    next();
  };
  const send =
    (
      status: number,
      work: (request: Parameters<RequestHandler>[0]) => Promise<unknown>,
    ): RequestHandler =>
    async (request, response) => {
      response.status(status).json(await work(request));
    };
  routes.use(authenticate);
  routes.get(
    "/",
    send(200, async (request) =>
      backupsSchemas.overview.output.parse(
        await backupsService.overview(requestContext(request), config),
      ),
    ),
  );
  routes.post(
    "/",
    send(201, (request) => backupsService.create(requestContext(request), config)),
  );
  routes.post(
    "/import",
    importPreflight,
    upload.single("backup"),
    send(201, (request) => backupsService.import(requestContext(request), config, request.file)),
  );
  routes.put(
    "/schedule",
    send(200, (request) => backupsService.schedule(requestContext(request), request.body)),
  );
  routes.get(
    "/restore",
    send(200, (request) => backupsService.restoreStatus(requestContext(request))),
  );
  routes.post(
    "/maintenance/end",
    send(200, (request) => backupsService.endMaintenance(requestContext(request))),
  );
  routes.post(
    "/:id/restore",
    send(202, (request) =>
      backupsService.restore(requestContext(request), config, {
        ...request.body,
        id: request.params.id,
      }),
    ),
  );
  return routes;
}
