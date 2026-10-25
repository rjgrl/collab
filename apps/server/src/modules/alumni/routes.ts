import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { alumniController } from "./controller";

export const alumniRoutes = Router();
alumniRoutes.use(authenticate);
alumniRoutes.get("/", authorize("alumni.read"), alumniController.list);
alumniRoutes.get("/pending-accounts", authorize("alumni.read"), alumniController.pendingAccounts);
alumniRoutes.get("/:id", authorize("alumni.read"), alumniController.get);
alumniRoutes.post("/", authorize("alumni.write"), alumniController.create);
alumniRoutes.patch("/:id", authorize("alumni.write"), alumniController.update);
alumniRoutes.delete("/:id", authorize("alumni.delete"), alumniController.delete);
alumniRoutes.post(
  "/:alumniId/employments",
  authorize("alumni.write"),
  alumniController.addEmployment,
);
alumniRoutes.post(
  "/:alumniId/tracking-events",
  authorize("tracking.write"),
  alumniController.addTracking,
);
