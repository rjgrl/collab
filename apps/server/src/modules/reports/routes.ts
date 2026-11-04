import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reportsController } from "./controller";
import { pdfReportsController } from "./pdf/controller";

export const reportsRoutes = Router();
reportsRoutes.use(authenticate);
reportsRoutes.get("/", authorize("reports.read"), reportsController.summary);
reportsRoutes.get("/alumni.csv", authorize("reports.export"), reportsController.alumniCsv);
reportsRoutes.get("/alumni.pdf", authorize("reports.export"), pdfReportsController.alumniList);
reportsRoutes.get(
  "/alumni/:id/profile.pdf",
  authorize("reports.export"),
  pdfReportsController.profile,
);
reportsRoutes.get(
  "/assignments.pdf",
  authorize("reports.export"),
  pdfReportsController.assignments,
);
