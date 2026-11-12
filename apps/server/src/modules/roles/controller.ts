import { rolesSchemas } from "@Alumni-Tracking-Ss/contracts/roles";
import { controller } from "../../middleware/controller";
import { rolesService } from "./service";

export const rolesController = {
  list: controller(rolesSchemas.list, rolesService.list, "none", 200),
  create: controller(rolesSchemas.create, rolesService.create, "body", 201),
  update: controller(rolesSchemas.update, rolesService.update, "combined", 200),
  delete: controller(rolesSchemas.delete, rolesService.delete, "params", 200),
};
