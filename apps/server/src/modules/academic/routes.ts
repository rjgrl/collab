import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { departmentsController } from "./controller";

export const academicRoutes = Router();
academicRoutes.use(authenticate);
academicRoutes.get("/", authorize("departments.read"), departmentsController.list);
academicRoutes.get("/:id", authorize("departments.read"), departmentsController.get);
academicRoutes.post("/", authorize("departments.write"), departmentsController.create);
academicRoutes.patch("/:id", authorize("departments.write"), departmentsController.update);
academicRoutes.delete("/:id", authorize("departments.delete"), departmentsController.delete);
