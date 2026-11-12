import { Router } from "express";
import multer from "multer";
import { MAX_EVIDENCE_BYTES } from "@Alumni-Tracking-Ss/api/integrations/files";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { filesController } from "./controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EVIDENCE_BYTES, files: 1, fields: 3, fieldSize: 1024, parts: 4 },
});
export const filesRoutes = Router();
export const ownFilesRoutes = Router();
ownFilesRoutes.use(authenticate, authorize(undefined, false));
ownFilesRoutes.post("/", upload.single("file"), filesController.uploadOwn);
ownFilesRoutes.get("/:id", filesController.downloadOwn);
ownFilesRoutes.delete("/:id", filesController.removeOwn);
filesRoutes.use(authenticate);
filesRoutes.post(
  "/evidence",
  authorize("files.write"),
  upload.single("file"),
  filesController.upload,
);
filesRoutes.get("/:id", authorize("files.read", false), filesController.download);
filesRoutes.delete("/:id", authorize("files.delete"), filesController.remove);
