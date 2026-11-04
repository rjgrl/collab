import { collegesSchemas, departmentsSchemas } from "@Alumni-Tracking-Ss/contracts/academic";
import { controller } from "../../middleware/controller";
import { collegeWriteService, collegesService, departmentsService } from "./service";

export const departmentsController = {
  list: controller(departmentsSchemas.list, departmentsService.list, "query", 200),
  get: controller(departmentsSchemas.get, departmentsService.get, "params", 200),
  create: controller(departmentsSchemas.create, departmentsService.create, "body", 201),
  update: controller(departmentsSchemas.update, departmentsService.update, "combined", 200),
  delete: controller(departmentsSchemas.delete, departmentsService.delete, "params", 200),
};

export const collegesController = {
  list: controller(collegesSchemas.list, collegesService.list, "query", 200),
  create: controller(collegesSchemas.create, collegeWriteService.create, "body", 201),
  update: controller(collegesSchemas.update, collegeWriteService.update, "combined", 200),
  delete: controller(collegesSchemas.delete, collegeWriteService.delete, "params", 200),
};
