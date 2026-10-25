import { reportsSchemas } from "@Alumni-Tracking-Ss/contracts/reports";
import { controller } from "../../middleware/controller";
import { reportsService } from "./service";

export const reportsController = {
  summary: controller(reportsSchemas.summary, reportsService.summary, "query", 200),
  alumniCsv: controller(reportsSchemas.alumniCsv, reportsService.alumniCsv, "query", 200),
};
