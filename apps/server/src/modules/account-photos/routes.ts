import { Router, type RequestHandler } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import multer from "multer";
import {
  accountPhotoParamsSchema,
  accountPhotoResultSchema,
  MAX_ACCOUNT_PHOTO_BYTES,
} from "@Alumni-Tracking-Ss/contracts/account-photo";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { requestContext } from "../../middleware/request-context";
import { downloadAccountPhoto, removeAccountPhoto, uploadAccountPhoto } from "./service";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ACCOUNT_PHOTO_BYTES, files: 1, fields: 0, parts: 1 },
});
export const ownPhotoRoutes = Router();
ownPhotoRoutes.use(authenticate, authorize(undefined, false));
ownPhotoRoutes.post("/", upload.single("file"), (async (request, response) => {
  response
    .status(201)
    .json(
      accountPhotoResultSchema.parse(
        await uploadAccountPhoto(requestContext(request), request.file),
      ),
    );
}) satisfies RequestHandler);
ownPhotoRoutes.delete("/", (async (request, response) => {
  response.json(accountPhotoResultSchema.parse(await removeAccountPhoto(requestContext(request))));
}) satisfies RequestHandler);

export const accountPhotoRoutes = Router();
accountPhotoRoutes.use(authenticate, authorize(undefined, false));
accountPhotoRoutes.get("/:userId/:id", (async (request, response) => {
  const { userId, id } = accountPhotoParamsSchema.parse(request.params);
  const photo = await downloadAccountPhoto(requestContext(request), userId, id);
  response.set({
    "Content-Type": photo.mimeType,
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  });
  if (Buffer.isBuffer(photo.buffer)) response.send(photo.buffer);
  else
    await pipeline(
      Readable.fromWeb(photo.buffer as import("node:stream/web").ReadableStream),
      response,
    );
}) satisfies RequestHandler);
