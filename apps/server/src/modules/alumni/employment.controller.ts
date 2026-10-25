import { alumniSchemas, selfEmploymentSchemas } from "@Alumni-Tracking-Ss/contracts/alumni";
import { controller } from "../../middleware/controller";
import { employmentService } from "./employment.service";
export const employmentController = {
  createOwn: controller(
    selfEmploymentSchemas.create,
    (c, p) => employmentService.create(c, p),
    "body",
    201,
  ),
  updateOwn: controller(
    selfEmploymentSchemas.update,
    (c, { id, ...p }) => employmentService.update(c, id, p, true),
    "combined",
  ),
  removeOwn: controller(
    selfEmploymentSchemas.remove,
    (c, p) => employmentService.remove(c, p.id, true),
    "params",
  ),
  update: controller(
    alumniSchemas.updateEmployment,
    (c, { id, ...p }) => employmentService.update(c, id, p),
    "combined",
  ),
};
