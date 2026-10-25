import { z } from "zod";
import { dateSchema, objectIdSchema, paginationSchema } from "./common";
import {
  emailSchema,
  newPasswordSchema,
  accountProfileSchema,
  academicProfileSchema,
} from "./auth";
import { structuredNameSchema } from "./names";
import { idsSchema } from "./roles";
export const publicUserSchema = z.object({
  id: objectIdSchema,
  name: z.string(),
  firstName: z.string().optional(),
  middleName: z.string().optional(),
  lastName: z.string().optional(),
  suffix: z.string().optional(),
  alumniId: objectIdSchema.nullable().optional(),
  email: emailSchema,
  image: z.string().nullable(),
  status: z.enum(["active", "disabled"]),
  createdAt: dateSchema,
  updatedAt: dateSchema,
  userRoles: z.array(
    z.object({
      roleId: objectIdSchema,
      role: z.object({ id: objectIdSchema, key: z.string(), name: z.string() }),
    }),
  ),
});
export const usersSchemas = {
  list: { input: paginationSchema, output: z.array(publicUserSchema) },
  create: {
    input: structuredNameSchema
      .extend({
        email: emailSchema,
        password: newPasswordSchema,
        roleIds: idsSchema.min(1).optional(),
        alumniProfile: accountProfileSchema
          .omit({ firstName: true, middleName: true, lastName: true, suffix: true })
          .extend(academicProfileSchema.shape)
          .strict()
          .optional(),
      })
      .strict(),
    output: publicUserSchema,
  },
  update: {
    input: structuredNameSchema
      .omit({ middleName: true, suffix: true })
      .partial()
      .extend({
        middleName: structuredNameSchema.shape.middleName.removeDefault().optional(),
        suffix: structuredNameSchema.shape.suffix.removeDefault().optional(),
        id: objectIdSchema,
        roleIds: idsSchema.optional(),
        password: newPasswordSchema.optional(),
      })
      .strict(),
    output: publicUserSchema,
  },
  setStatus: {
    input: z.object({ id: objectIdSchema, status: z.enum(["active", "disabled"]) }).strict(),
    output: publicUserSchema,
  },
};
export type PublicUser = z.infer<typeof publicUserSchema>;
export type UserInput<K extends keyof typeof usersSchemas> = z.infer<
  (typeof usersSchemas)[K]["input"]
>;
