import { z } from "zod";
import { dateSchema, idInputSchema, objectIdSchema, okSchema } from "./common";
import { noInputSchema } from "./auth";
export const idsSchema = z
  .array(objectIdSchema)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate assignments are not allowed.");
export const permissionSchema = z.object({
  id: objectIdSchema,
  key: z.string(),
  name: z.string(),
  module: z.string(),
  description: z.string().default(""),
  createdAt: dateSchema.optional(),
  updatedAt: dateSchema.optional(),
});
export const roleSchema = z.object({
  id: objectIdSchema,
  key: z.string(),
  name: z.string(),
  description: z.string(),
  isSystem: z.boolean(),
  // A role split from Super Admin or Faculty; its members keep that kind of account.
  baseRole: z.enum(["super_admin", "faculty"]).nullable().default(null),
  createdAt: dateSchema,
  updatedAt: dateSchema,
  rolePermissions: z.array(
    z.object({ permissionId: objectIdSchema, permission: permissionSchema }),
  ),
  _count: z.object({ userRoles: z.number().int().nonnegative() }).default({ userRoles: 0 }),
  // Member names, listed for roles that can be split (not Alumni).
  members: z
    .array(z.object({ id: objectIdSchema, name: z.string(), email: z.string() }))
    .default([]),
});
export const rolesSchemas = {
  list: { input: noInputSchema, output: z.array(roleSchema) },
  create: {
    input: z
      .object({
        key: z
          .string()
          .trim()
          .regex(/^[a-z][a-z0-9_]{0,63}$/),
        name: z.string().trim().min(1).max(80),
        description: z.string().max(400).optional(),
        permissionIds: idsSchema.default([]),
      })
      .strict(),
    output: roleSchema,
  },
  update: {
    input: z
      .object({
        id: objectIdSchema,
        expectedUpdatedAt: z.string().datetime(),
        name: z.string().trim().min(1).max(80).optional(),
        description: z.string().max(400).optional(),
        permissionIds: idsSchema.optional(),
      })
      .strict(),
    output: roleSchema,
  },
  delete: { input: idInputSchema, output: okSchema },
  /** Moves the selected members to a new role holding the edited permissions. */
  split: {
    input: z
      .object({
        id: objectIdSchema,
        expectedUpdatedAt: z.string().datetime(),
        userIds: idsSchema.refine((ids) => ids.length > 0, "Select at least one member."),
        name: z.string().trim().min(1).max(80),
        description: z.string().max(400).optional(),
        permissionIds: idsSchema,
      })
      .strict(),
    output: roleSchema,
  },
};
export const permissionsSchemas = {
  list: { input: noInputSchema, output: z.array(permissionSchema) },
};
export type Role = z.infer<typeof roleSchema>;
export type RoleInput<K extends keyof typeof rolesSchemas> = z.infer<
  (typeof rolesSchemas)[K]["input"]
>;
