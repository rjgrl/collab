import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reportsController } from "./controller";

export const reportsRoutes = Router();
reportsRoutes.use(authenticate);
reportsRoutes.get("/", authorize("reports.read"), reportsController.summary);
reportsRoutes.get("/alumni.csv", authorize("reports.export"), reportsController.alumniCsv);
