import { programsSchemas } from "@Alumni-Tracking-Ss/contracts/academic";
import { controller } from "../../middleware/controller";
import { programsService } from "../academic/service";

export const programsController = {
  list: controller(programsSchemas.list, programsService.list, "query", 200),
  get: controller(programsSchemas.get, programsService.get, "params", 200),
  create: controller(programsSchemas.create, programsService.create, "body", 201),
  update: controller(programsSchemas.update, programsService.update, "combined", 200),
  delete: controller(programsSchemas.delete, programsService.delete, "params", 200),
};
