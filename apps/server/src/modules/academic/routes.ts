import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { collegesController, departmentsController } from "./controller";

export const departmentsRoutes = Router();
departmentsRoutes.use(authenticate);
departmentsRoutes.get("/", authorize("departments.read"), departmentsController.list);
departmentsRoutes.get("/:id", authorize("departments.read"), departmentsController.get);
departmentsRoutes.post("/", authorize("departments.write"), departmentsController.create);
departmentsRoutes.patch("/:id", authorize("departments.write"), departmentsController.update);
departmentsRoutes.delete("/:id", authorize("departments.delete"), departmentsController.delete);

export const collegesRoutes = Router();
collegesRoutes.use(authenticate);
collegesRoutes.get("/", authorize("departments.read"), collegesController.list);
collegesRoutes.post("/", authorize("departments.write"), collegesController.create);
collegesRoutes.patch("/:id", authorize("departments.write"), collegesController.update);
collegesRoutes.delete("/:id", authorize("departments.delete"), collegesController.delete);
