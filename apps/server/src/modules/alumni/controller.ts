import { alumniSchemas } from "@Alumni-Tracking-Ss/contracts/alumni";
import { controller } from "../../middleware/controller";
import { alumniService } from "./service";

export const alumniController = {
  pendingAccounts: controller(
    alumniSchemas.pendingAccounts,
    alumniService.pendingAccounts,
    "query",
    200,
  ),
  list: controller(alumniSchemas.list, alumniService.list, "query", 200),
  get: controller(alumniSchemas.get, alumniService.get, "params", 200),
  create: controller(alumniSchemas.create, alumniService.create, "body", 201),
  update: controller(alumniSchemas.update, alumniService.update, "combined", 200),
  delete: controller(alumniSchemas.delete, alumniService.delete, "params", 200),
  addEmployment: controller(
    alumniSchemas.addEmployment,
    alumniService.addEmployment,
    "combined",
    201,
  ),
  addTracking: controller(alumniSchemas.addTracking, alumniService.addTracking, "combined", 201),
};
