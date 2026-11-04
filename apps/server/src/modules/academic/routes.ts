import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { collegesController, departmentsController } from "./controller";

export const academicRoutes = Router();
academicRoutes.use(authenticate);
academicRoutes.get("/", authorize("departments.read"), departmentsController.list);
academicRoutes.get("/:id", authorize("departments.read"), departmentsController.get);
academicRoutes.post("/", authorize("departments.write"), departmentsController.create);
academicRoutes.patch("/:id", authorize("departments.write"), departmentsController.update);
academicRoutes.delete("/:id", authorize("departments.delete"), departmentsController.delete);

export const collegesRoutes = Router();
collegesRoutes.use(authenticate);
collegesRoutes.get("/", authorize("departments.read"), collegesController.list);
collegesRoutes.post("/", authorize("departments.write"), collegesController.create);
collegesRoutes.patch("/:id", authorize("departments.write"), collegesController.update);
collegesRoutes.delete("/:id", authorize("departments.delete"), collegesController.delete);
