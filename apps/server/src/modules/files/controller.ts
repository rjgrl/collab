import type { Request, RequestHandler, Response } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { idInputSchema } from "@Alumni-Tracking-Ss/contracts/common";
import {
  filesSchemas,
  uploadOutputSchema as uploadOutput,
} from "@Alumni-Tracking-Ss/contracts/alumni";
import { requestContext } from "../../middleware/request-context";
import { controller } from "../../middleware/controller";
import { downloadEvidence, uploadEvidence, uploadInputSchema } from "./service";
import { filesService } from "../alumni/service";
import { selfUploadInputSchema } from "@Alumni-Tracking-Ss/contracts/alumni";
import { linkedAlumni } from "../alumni/access";

type PrivateFile = Awaited<ReturnType<typeof downloadEvidence>>;

/**
 * Sends a stored evidence file. Local files arrive as a Buffer; Google Drive and imgBB files arrive
 * as a web stream, which `response.send` would serialise as "{}", so those are piped instead.
 */
async function sendPrivateFile(request: Request, response: Response, file: PrivateFile) {
  const preview =
    request.query.preview === "1" &&
    ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.mimeType);
  response.set({
    "Content-Type": file.mimeType,
    "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${file.name}"`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  });
  if (Buffer.isBuffer(file.buffer)) response.send(file.buffer);
  else await pipeline(Readable.fromWeb(file.buffer as ReadableStream), response);
}

export const filesController = {
  uploadOwn: (async (request, response) => {
    const input = selfUploadInputSchema.parse(request.body);
    const context = requestContext(request);
    const alumni = await linkedAlumni(context);
    response
      .status(201)
      .json(
        uploadOutput.parse(
          await uploadEvidence(context, { ...input, alumniId: alumni.id }, request.file, true),
        ),
      );
  }) satisfies RequestHandler,
  downloadOwn: (async (request, response) => {
    const { id } = idInputSchema.parse(request.params);
    const file = await downloadEvidence(requestContext(request), id, true);
    await sendPrivateFile(request, response, file);
  }) satisfies RequestHandler,
  removeOwn: controller(filesSchemas.remove, (c, p) => filesService.remove(c, p, true), "params"),
  upload: (async (request, response) => {
    const input = uploadInputSchema.parse(request.body);
    response
      .status(201)
      .json(uploadOutput.parse(await uploadEvidence(requestContext(request), input, request.file)));
  }) satisfies RequestHandler,
  download: (async (request, response) => {
    const { id } = idInputSchema.parse(request.params);
    const file = await downloadEvidence(requestContext(request), id);
    await sendPrivateFile(request, response, file);
  }) satisfies RequestHandler,
  remove: controller(filesSchemas.remove, filesService.remove, "params"),
};
