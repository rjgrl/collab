import { alumniSchemas, meProfileSchemas } from "@Alumni-Tracking-Ss/contracts/alumni";
import { controller } from "../../middleware/controller";
import { linkAlumni, meProfileService, alumniService } from "./service";

export const meProfileController = {
  get: controller(meProfileSchemas.get, meProfileService.get, "none"),
  update: controller(meProfileSchemas.update, meProfileService.update, "body"),
};
export const linkController = controller(alumniSchemas.linkAlumni, linkAlumni, "combined");
export const deleteEmploymentController = controller(
  alumniSchemas.deleteEmployment,
  alumniService.deleteEmployment,
  "params",
);
