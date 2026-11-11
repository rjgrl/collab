import { Router, type RequestHandler } from "express";
import type { BackupConfig } from "@Alumni-Tracking-Ss/api/backups/backup-service";
import { backupsSchemas } from "@Alumni-Tracking-Ss/contracts/backups";
import { authenticate } from "../../middleware/authenticate";
import { requestContext } from "../../middleware/request-context";
import { backupsService } from "./service";

/** Backup routes receive the server-only backup configuration; it never reaches the browser. */
export function backupsRoutes(config: BackupConfig | undefined) {
  const routes = Router();
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
  routes.put(
    "/schedule",
    send(200, (request) => backupsService.schedule(requestContext(request), request.body)),
  );
  routes.get(
    "/restore",
    send(200, (request) => backupsService.restoreStatus(requestContext(request))),
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
