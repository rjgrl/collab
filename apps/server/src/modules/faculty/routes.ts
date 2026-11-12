import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { facultyController } from "./controller";

// Faculty management is gated by faculty role level and scope inside the service, not by RBAC keys.
export const facultyRoutes = Router();
facultyRoutes.use(authenticate);
facultyRoutes.get("/", authorize(), facultyController.list);
facultyRoutes.post("/", authorize(), facultyController.create);
facultyRoutes.patch("/:id", authorize(), facultyController.update);
