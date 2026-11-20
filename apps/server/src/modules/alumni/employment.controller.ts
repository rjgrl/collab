import { alumniSchemas, selfEmploymentSchemas } from "@Alumni-Tracking-Ss/contracts/alumni";
import { controller } from "../../middleware/controller";
import { employmentService } from "./employment.service";
import { timestampedService } from "./timestamp-service";
import type { z } from "zod";
export const employmentController = {
  createOwn: controller(
    selfEmploymentSchemas.create,
    timestampedService(
      "self-employment",
      (c, p: z.input<typeof selfEmploymentSchemas.create.input>) => employmentService.create(c, p),
    ),
    "body",
    201,
  ),
  updateOwn: controller(
    selfEmploymentSchemas.update,
    timestampedService(
      "self-employment",
      (c, { id, ...p }: z.input<typeof selfEmploymentSchemas.update.input>) =>
        employmentService.update(c, id, p, true),
    ),
    "combined",
  ),
  removeOwn: controller(
    selfEmploymentSchemas.remove,
    timestampedService(
      "self-employment",
      (c, p: z.input<typeof selfEmploymentSchemas.remove.input>) =>
        employmentService.remove(c, p.id, true),
    ),
    "params",
  ),
  update: controller(
    alumniSchemas.updateEmployment,
    timestampedService(
      "employment",
      (c, { id, ...p }: z.input<typeof alumniSchemas.updateEmployment.input>) =>
        employmentService.update(c, id, p),
    ),
    "combined",
  ),
};
