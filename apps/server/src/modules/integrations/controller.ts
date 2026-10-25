import { integrationsSchemas } from "@Alumni-Tracking-Ss/contracts/integrations";
import { controller } from "../../middleware/controller";
import { integrationsService } from "./service";

export const integrationsController = {
  list: controller(integrationsSchemas.list, integrationsService.list, "none", 200),
  toggle: controller(integrationsSchemas.toggle, integrationsService.toggle, "combined", 200),
  sendTestEmail: controller(
    integrationsSchemas.sendTestEmail,
    integrationsService.sendTestEmail,
    "body",
    201,
  ),
  notifyAlumni: controller(
    integrationsSchemas.notifyAlumni,
    integrationsService.notifyAlumni,
    "body",
    201,
  ),
  importCsv: controller(integrationsSchemas.importCsv, integrationsService.importCsv, "body", 201),
  importSheets: controller(
    integrationsSchemas.importSheets,
    integrationsService.importSheets,
    "none",
    201,
  ),
  exportSheets: controller(
    integrationsSchemas.exportSheets,
    integrationsService.exportSheets,
    "body",
    201,
  ),
};
