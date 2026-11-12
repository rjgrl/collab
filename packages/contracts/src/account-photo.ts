import { z } from "zod";
import { objectIdSchema } from "./common";

export const ACCOUNT_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const MAX_ACCOUNT_PHOTO_BYTES = 10 * 1024 * 1024;
export const accountPhotoParamsSchema = z
  .object({ userId: objectIdSchema, id: objectIdSchema })
  .strict();
export const accountPhotoResultSchema = z.object({ image: z.string().nullable() });
