import { z } from "zod";
import { objectIdSchema, dateSchema, paginationSchema } from "./common";
export const auditListInputSchema = paginationSchema.strict().optional();
export const auditActorSchema = z.object({
  id: objectIdSchema,
  name: z.string(),
  email: z.string(),
});
export const auditOutputSchema = z.object({
  id: objectIdSchema,
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable().optional(),
  summary: z.string(),
  createdAt: dateSchema,
  actorId: objectIdSchema.nullable().optional(),
  actorIsSnapshot: z.boolean().default(false),
  actor: auditActorSchema.nullable(),
});
export const auditListOutputSchema = z.array(auditOutputSchema);
export const auditSchemas = {
  list: { input: auditListInputSchema, output: auditListOutputSchema },
};
