import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { programsController } from "./controller";

export const programsRoutes = Router();
programsRoutes.use(authenticate);
programsRoutes.get("/", authorize("programs.read"), programsController.list);
programsRoutes.get("/:id", authorize("programs.read"), programsController.get);
programsRoutes.post("/", authorize("programs.write"), programsController.create);
programsRoutes.patch("/:id", authorize("programs.write"), programsController.update);
programsRoutes.delete("/:id", authorize("programs.delete"), programsController.delete);
