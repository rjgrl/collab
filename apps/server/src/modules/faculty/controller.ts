import { facultySchemas } from "@Alumni-Tracking-Ss/contracts/faculty";
import { controller } from "../../middleware/controller";
import { facultyService } from "./service";

export const facultyController = {
  list: controller(facultySchemas.list, facultyService.list, "query", 200),
  create: controller(facultySchemas.create, facultyService.create, "body", 201),
  update: controller(facultySchemas.update, facultyService.update, "combined", 200),
};
