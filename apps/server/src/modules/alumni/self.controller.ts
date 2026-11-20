import { alumniSchemas, meProfileSchemas } from "@Alumni-Tracking-Ss/contracts/alumni";
import { controller } from "../../middleware/controller";
import { linkAlumni, meProfileService, alumniService } from "./service";
import { timestampedService } from "./timestamp-service";

export const meProfileController = {
  get: controller(meProfileSchemas.get, meProfileService.get, "none"),
  update: controller(meProfileSchemas.update, meProfileService.update, "body"),
};
export const linkController = controller(alumniSchemas.linkAlumni, linkAlumni, "combined");
export const deleteEmploymentController = controller(
  alumniSchemas.deleteEmployment,
  timestampedService("employment", alumniService.deleteEmployment),
  "params",
);
