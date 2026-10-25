import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { auditController } from "./controller";

export const auditRoutes = Router();
auditRoutes.use(authenticate);
auditRoutes.get("/", authorize("audit.read"), auditController.list);
