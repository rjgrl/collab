import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { usersController } from "./controller";
import { linkController } from "../alumni/self.controller";

export const usersRoutes = Router();
usersRoutes.use(authenticate);
usersRoutes.get("/", authorize("users.read"), usersController.list);
usersRoutes.post("/", authorize("users.write"), usersController.create);
usersRoutes.patch("/:id", authorize("users.write"), usersController.update);
usersRoutes.patch("/:id/status", authorize("users.delete"), usersController.setStatus);
usersRoutes.post("/:id/alumni-link", authorize("users.write"), linkController);
