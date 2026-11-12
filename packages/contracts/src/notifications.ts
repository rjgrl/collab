import { z } from "zod";
import { dateSchema, idInputSchema, objectIdSchema, okSchema } from "./common";

export const notificationSchema = z.object({
  id: objectIdSchema,
  alumniId: objectIdSchema,
  evidenceId: objectIdSchema,
  summary: z.string(),
  createdAt: dateSchema,
  readAt: dateSchema.nullable(),
});
export const notificationsSchemas = {
  list: {
    input: z.object({}).strict(),
    output: z.object({ items: z.array(notificationSchema), unreadCount: z.number().int().min(0) }),
  },
  markRead: { input: idInputSchema, output: okSchema },
};
