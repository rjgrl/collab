import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { rolesController } from "./controller";

export const rolesRoutes = Router();
rolesRoutes.use(authenticate);
rolesRoutes.get("/", authorize("roles.read"), rolesController.list);
rolesRoutes.post("/", authorize("roles.write"), rolesController.create);
rolesRoutes.patch("/:id", authorize("roles.write"), rolesController.update);
rolesRoutes.delete("/:id", authorize("roles.delete"), rolesController.delete);
