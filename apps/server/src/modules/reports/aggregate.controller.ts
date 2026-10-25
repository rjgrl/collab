import { aggregateSchemas } from "@Alumni-Tracking-Ss/contracts/reports";
import { controller } from "../../middleware/controller";
import { aggregateSummary } from "./aggregate.service";
export const aggregateController = controller(aggregateSchemas.summary, aggregateSummary, "query");
