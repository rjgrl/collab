import { dashboardSchemas } from "@Alumni-Tracking-Ss/contracts/reports";
import { controller } from "../../middleware/controller";
import { dashboardService } from "./service";
export const dashboardController = controller(
  dashboardSchemas.summary,
  dashboardService.summary,
  "query",
);
