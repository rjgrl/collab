import { departmentsSchemas } from "@Alumni-Tracking-Ss/contracts/academic";
import { controller } from "../../middleware/controller";
import { departmentsService } from "./service";

export const departmentsController = {
  list: controller(departmentsSchemas.list, departmentsService.list, "query", 200),
  get: controller(departmentsSchemas.get, departmentsService.get, "params", 200),
  create: controller(departmentsSchemas.create, departmentsService.create, "body", 201),
  update: controller(departmentsSchemas.update, departmentsService.update, "combined", 200),
  delete: controller(departmentsSchemas.delete, departmentsService.delete, "params", 200),
};
