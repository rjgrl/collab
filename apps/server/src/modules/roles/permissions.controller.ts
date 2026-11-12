import { permissionsSchemas } from "@Alumni-Tracking-Ss/contracts/roles";
import { controller } from "../../middleware/controller";
import { permissionsService } from "./service";
export const permissionsController = controller(
  permissionsSchemas.list,
  permissionsService.list,
  "none",
);
