import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { integrationsController } from "./controller";

export const integrationsRoutes = Router();
integrationsRoutes.use(authenticate);
integrationsRoutes.get("/", authorize("integrations.read"), integrationsController.list);
integrationsRoutes.patch("/:key", authorize("integrations.write"), integrationsController.toggle);
integrationsRoutes.post(
  "/email/test-messages",
  authorize("integrations.write"),
  integrationsController.sendTestEmail,
);
integrationsRoutes.post(
  "/email/notifications",
  authorize("integrations.write"),
  integrationsController.notifyAlumni,
);
integrationsRoutes.post(
  "/csv/imports",
  authorize("integrations.write"),
  integrationsController.importCsv,
);
integrationsRoutes.post(
  "/google-sheets/imports",
  authorize("integrations.write"),
  integrationsController.importSheets,
);
integrationsRoutes.post(
  "/google-sheets/exports",
  authorize("reports.export"),
  integrationsController.exportSheets,
);
