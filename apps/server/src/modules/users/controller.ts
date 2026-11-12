import { usersSchemas } from "@Alumni-Tracking-Ss/contracts/users";
import { controller } from "../../middleware/controller";
import { usersService } from "./service";

export const usersController = {
  list: controller(usersSchemas.list, usersService.list, "query", 200),
  create: controller(usersSchemas.create, usersService.create, "body", 201),
  update: controller(usersSchemas.update, usersService.update, "combined", 200),
  setStatus: controller(usersSchemas.setStatus, usersService.setStatus, "combined", 200),
};
