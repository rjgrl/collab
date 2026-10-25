import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { notificationsController } from "./controller";

export const notificationsRoutes = Router();
notificationsRoutes.use(authenticate, authorize(undefined, false));
notificationsRoutes.get("/", notificationsController.list);
notificationsRoutes.patch("/:id/read", notificationsController.markRead);
