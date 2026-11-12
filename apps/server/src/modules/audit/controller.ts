import { auditSchemas } from "@Alumni-Tracking-Ss/contracts/audit";
import { controller } from "../../middleware/controller";
import { auditService } from "./service";

export const auditController = {
  list: controller(auditSchemas.list, auditService.list, "query", 200),
};
