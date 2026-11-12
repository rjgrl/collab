import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { auditController } from "./controller";

export const auditRoutes = Router();
auditRoutes.use(authenticate);
// Administrators (audit.read) see everything; heads see their scope. The service decides.
auditRoutes.get("/", auditController.list);
