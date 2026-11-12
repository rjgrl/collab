import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { alumniController } from "./controller";

export const alumniRoutes = Router();
alumniRoutes.use(authenticate);
alumniRoutes.get("/", authorize("alumni.read"), alumniController.list);
alumniRoutes.get("/pending-accounts", authorize("alumni.read"), alumniController.pendingAccounts);
alumniRoutes.get("/:id", authorize("alumni.read"), alumniController.get);
alumniRoutes.get("/:id/history", authorize("alumni.read"), alumniController.history);
alumniRoutes.post("/:alumniId/contacts", authorize("alumni.write"), alumniController.addContact);
alumniRoutes.patch(
  "/:alumniId/contacts/:id",
  authorize("alumni.write"),
  alumniController.updateContact,
);
alumniRoutes.delete(
  "/:alumniId/contacts/:id",
  authorize("alumni.write"),
  alumniController.deleteContact,
);
alumniRoutes.post("/", authorize("alumni.write"), alumniController.create);
alumniRoutes.post("/assign", authorize("alumni.write"), alumniController.assign);
alumniRoutes.patch("/:id", authorize("alumni.write"), alumniController.update);
alumniRoutes.delete("/:id", authorize("alumni.delete"), alumniController.delete);
alumniRoutes.post(
  "/:alumniId/employments",
  authorize("alumni.write"),
  alumniController.addEmployment,
);
alumniRoutes.get(
  "/:alumniId/tracking-events",
  authorize("alumni.read"),
  alumniController.trackingEvents,
);
// files.write, then the service narrows to Super Admins and the directly assigned faculty tracker.
alumniRoutes.delete("/:alumniId/photo", authorize("files.write"), alumniController.removePhoto);
alumniRoutes.post(
  "/:alumniId/tracking-events",
  authorize("tracking.write"),
  alumniController.addTracking,
);
