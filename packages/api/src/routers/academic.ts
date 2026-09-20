import { withNotDeleted } from "@Alumni-Tracking-Ss/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { requirePermission } from "../index";
import { writeAudit } from "../audit";
import { departmentInputSchema, facultyInputSchema, programInputSchema } from "../validation";

export const departmentsRouter = {
  list: requirePermission("departments.read")
    .input(z.object({ search: z.string().optional() }).optional())
    .handler(async ({ context, input }) => {
      const search = input?.search?.trim();
      return context.db.department.findMany({
        where: withNotDeleted({
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { code: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        }),
        include: {
          _count: { select: { programs: true, facultyDepartments: true } },
        },
        orderBy: { name: "asc" },
      });
    }),

  get: requirePermission("departments.read")
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const department = await context.db.department.findFirst({
        where: withNotDeleted({ id: input.id }),
        include: {
          programs: { where: withNotDeleted() },
          facultyDepartments: { include: { faculty: true } },
        },
      });
      if (!department) {
        throw new ORPCError("NOT_FOUND", { message: "Department not found." });
      }
      return department;
    }),

  create: requirePermission("departments.write")
    .input(departmentInputSchema)
    .handler(async ({ context, input }) => {
      const department = await context.db.department.create({
        data: {
          code: input.code.toUpperCase(),
          name: input.name,
          description: input.description ?? "",
        },
      });
      await writeAudit(context.db, {
        actorId: context.user.id,
        action: "departments.create",
        entity: "department",
        entityId: department.id,
        summary: `Created department ${department.code}`,
        ipAddress: context.ipAddress,
      });
      return department;
    }),

  update: requirePermission("departments.write")
    .input(departmentInputSchema.extend({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const department = await context.db.department.update({
        where: { id: input.id },
        data: {
          code: input.code.toUpperCase(),
          name: input.name,
          description: input.description ?? "",
        },
      });
      await writeAudit(context.db, {
        actorId: context.user.id,
        action: "departments.update",
        entity: "department",
        entityId: department.id,
        summary: `Updated department ${department.code}`,
        ipAddress: context.ipAddress,
      });
      return department;
    }),

  delete: requirePermission("departments.delete")
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await context.db.department.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });
      await writeAudit(context.db, {
        actorId: context.user.id,
        action: "departments.delete",
        entity: "department",
        entityId: input.id,
        summary: "Soft-deleted department",
        ipAddress: context.ipAddress,
      });
      return { ok: true };
    }),
};

export const programsRouter = {
  list: requirePermission("programs.read")
    .input(z.object({ search: z.string().optional(), departmentId: z.string().optional() }).optional())
    .handler(async ({ context, input }) => {
      const search = input?.search?.trim();
      return context.db.program.findMany({
        where: withNotDeleted({
          departmentId: input?.departmentId,
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { code: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        }),
        include: {
          department: true,
          _count: { select: { alumni: true } },
        },
        orderBy: { name: "asc" },
      });
    }),

  create: requirePermission("programs.write")
    .input(programInputSchema)
    .handler(async ({ context, input }) => {
      const department = await context.db.department.findFirst({
        where: withNotDeleted({ id: input.departmentId }),
      });
      if (!department) {
        throw new ORPCError("BAD_REQUEST", { message: "Department not found." });
      }

      const program = await context.db.program.create({
        data: {
          code: input.code.toUpperCase(),
          name: input.name,
          description: input.description ?? "",
          departmentId: input.departmentId,
        },
        include: { department: true },
      });
      await writeAudit(context.db, {
        actorId: context.user.id,
        action: "programs.create",
        entity: "program",
        entityId: program.id,
        summary: `Created program ${program.code} in ${department.code}`,
        ipAddress: context.ipAddress,
      });
      return program;
    }),

  update: requirePermission("programs.write")
    .input(programInputSchema.extend({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const program = await context.db.program.update({
        where: { id: input.id },
        data: {
          code: input.code.toUpperCase(),
          name: input.name,
          description: input.description ?? "",
          departmentId: input.departmentId,
        },
        include: { department: true },
      });
      await writeAudit(context.db, {
        actorId: context.user.id,
        action: "programs.update",
        entity: "program",
        entityId: program.id,
        summary: `Updated program ${program.code}`,
        ipAddress: context.ipAddress,
      });
      return program;
    }),

  delete: requirePermission("programs.delete")
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await context.db.program.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });
      await writeAudit(context.db, {
        actorId: context.user.id,
        action: "programs.delete",
        entity: "program",
        entityId: input.id,
        summary: "Soft-deleted program",
        ipAddress: context.ipAddress,
      });
      return { ok: true };
    }),
};

export const facultiesRouter = {
  list: requirePermission("faculties.read")
    .input(z.object({ search: z.string().optional() }).optional())
    .handler(async ({ context, input }) => {
      const search = input?.search?.trim();
      return context.db.faculty.findMany({
        where: withNotDeleted({
          ...(search
            ? {
                OR: [
                  { firstName: { contains: search, mode: "insensitive" } },
                  { lastName: { contains: search, mode: "insensitive" } },
                  { employeeNumber: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        }),
        include: {
          facultyDepartments: { include: { department: true } },
        },
        orderBy: { lastName: "asc" },
      });
    }),

  create: requirePermission("faculties.write")
    .input(facultyInputSchema)
    .handler(async ({ context, input }) => {
      const faculty = await context.db.faculty.create({
        data: {
          employeeNumber: input.employeeNumber,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          facultyDepartments: {
            create: input.departmentIds.map((departmentId) => ({ departmentId })),
          },
        },
        include: { facultyDepartments: { include: { department: true } } },
      });
      await writeAudit(context.db, {
        actorId: context.user.id,
        action: "faculties.create",
        entity: "faculty",
        entityId: faculty.id,
        summary: `Created faculty ${faculty.employeeNumber}`,
        ipAddress: context.ipAddress,
      });
      return faculty;
    }),

  update: requirePermission("faculties.write")
    .input(facultyInputSchema.extend({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await context.db.facultyDepartment.deleteMany({ where: { facultyId: input.id } });
      if (input.departmentIds.length > 0) {
        await context.db.facultyDepartment.createMany({
          data: input.departmentIds.map((departmentId) => ({
            facultyId: input.id,
            departmentId,
          })),
        });
      }

      const faculty = await context.db.faculty.update({
        where: { id: input.id },
        data: {
          employeeNumber: input.employeeNumber,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
        },
        include: { facultyDepartments: { include: { department: true } } },
      });
      await writeAudit(context.db, {
        actorId: context.user.id,
        action: "faculties.update",
        entity: "faculty",
        entityId: faculty.id,
        summary: `Updated faculty ${faculty.employeeNumber}`,
        ipAddress: context.ipAddress,
      });
      return faculty;
    }),

  delete: requirePermission("faculties.delete")
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await context.db.faculty.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });
      await writeAudit(context.db, {
        actorId: context.user.id,
        action: "faculties.delete",
        entity: "faculty",
        entityId: input.id,
        summary: "Soft-deleted faculty",
        ipAddress: context.ipAddress,
      });
      return { ok: true };
    }),
};
