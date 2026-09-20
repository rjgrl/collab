import { withNotDeleted } from "@Alumni-Tracking-Ss/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { requirePermission } from "../index";
import { writeAudit } from "../audit";
import { alumniInputSchema, employmentInputSchema, trackingInputSchema } from "../validation";

export const alumniRouter = {
  list: requirePermission("alumni.read")
    .input(
      z
        .object({
          search: z.string().optional(),
          departmentId: z.string().optional(),
          programId: z.string().optional(),
          tracked: z.enum(["all", "tracked", "untracked"]).optional(),
          graduationYear: z.number().int().optional(),
        })
        .optional(),
    )
    .handler(async ({ context, input }) => {
      const search = input?.search?.trim();
      const trackedFilter =
        input?.tracked === "tracked" ? true : input?.tracked === "untracked" ? false : undefined;

      return context.db.alumni.findMany({
        where: withNotDeleted({
          isTracked: trackedFilter,
          graduationYear: input?.graduationYear,
          programId: input?.programId,
          program: withNotDeleted(
            input?.departmentId ? { departmentId: input.departmentId } : undefined,
          ),
          ...(search
            ? {
                OR: [
                  { studentNumber: { contains: search, mode: "insensitive" } },
                  { firstName: { contains: search, mode: "insensitive" } },
                  { lastName: { contains: search, mode: "insensitive" } },
                  { personalEmail: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        }),
        include: {
          program: { include: { department: true } },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      });
    }),

  get: requirePermission("alumni.read")
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const alumni = await context.db.alumni.findFirst({
        where: withNotDeleted({ id: input.id }),
        include: {
          program: { include: { department: true } },
          employments: { orderBy: { isCurrent: "desc" } },
          trackingEvents: { orderBy: { recordedAt: "desc" } },
          evidenceFiles: { where: withNotDeleted(), orderBy: { createdAt: "desc" } },
        },
      });
      if (!alumni) {
        throw new ORPCError("NOT_FOUND", { message: "Alumni record not found." });
      }
      return alumni;
    }),

  create: requirePermission("alumni.write")
    .input(alumniInputSchema)
    .handler(async ({ context, input }) => {
      const program = await context.db.program.findFirst({
        where: withNotDeleted({ id: input.programId }),
      });
      if (!program) {
        throw new ORPCError("BAD_REQUEST", { message: "Program not found." });
      }

      const duplicate = await context.db.alumni.findUnique({
        where: { studentNumber: input.studentNumber },
      });
      if (duplicate && !duplicate.deletedAt) {
        throw new ORPCError("CONFLICT", { message: "Student number already exists." });
      }

      const alumni = await context.db.alumni.create({
        data: {
          studentNumber: input.studentNumber,
          firstName: input.firstName,
          lastName: input.lastName,
          middleName: input.middleName,
          gender: input.gender,
          graduationYear: input.graduationYear,
          batch: input.batch,
          mobileNumber: input.mobileNumber,
          personalEmail: input.personalEmail,
          facebookAccount: input.facebookAccount,
          programId: input.programId,
          employmentStatus: input.employmentStatus ?? "unknown",
        },
        include: { program: { include: { department: true } } },
      });

      await writeAudit(context.db, {
        actorId: context.user.id,
        action: "alumni.create",
        entity: "alumni",
        entityId: alumni.id,
        summary: `Created alumni ${alumni.studentNumber}`,
        ipAddress: context.ipAddress,
      });

      return alumni;
    }),

  update: requirePermission("alumni.write")
    .input(alumniInputSchema.extend({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const alumni = await context.db.alumni.update({
        where: { id: input.id },
        data: {
          studentNumber: input.studentNumber,
          firstName: input.firstName,
          lastName: input.lastName,
          middleName: input.middleName,
          gender: input.gender,
          graduationYear: input.graduationYear,
          batch: input.batch,
          mobileNumber: input.mobileNumber,
          personalEmail: input.personalEmail,
          facebookAccount: input.facebookAccount,
          programId: input.programId,
          employmentStatus: input.employmentStatus,
        },
        include: { program: { include: { department: true } } },
      });

      await writeAudit(context.db, {
        actorId: context.user.id,
        action: "alumni.update",
        entity: "alumni",
        entityId: alumni.id,
        summary: `Updated alumni ${alumni.studentNumber}`,
        ipAddress: context.ipAddress,
      });

      return alumni;
    }),

  delete: requirePermission("alumni.delete")
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await context.db.alumni.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });
      await writeAudit(context.db, {
        actorId: context.user.id,
        action: "alumni.delete",
        entity: "alumni",
        entityId: input.id,
        summary: "Soft-deleted alumni record",
        ipAddress: context.ipAddress,
      });
      return { ok: true };
    }),

  addEmployment: requirePermission("alumni.write")
    .input(employmentInputSchema)
    .handler(async ({ context, input }) => {
      if (input.isCurrent) {
        await context.db.employment.updateMany({
          where: { alumniId: input.alumniId, isCurrent: true },
          data: { isCurrent: false },
        });
      }

      const employment = await context.db.employment.create({
        data: {
          alumniId: input.alumniId,
          employer: input.employer,
          jobTitle: input.jobTitle,
          industry: input.industry,
          location: input.location,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          isCurrent: input.isCurrent,
          status: input.status,
          notes: input.notes ?? "",
        },
      });

      await context.db.alumni.update({
        where: { id: input.alumniId },
        data: { employmentStatus: input.status },
      });

      await writeAudit(context.db, {
        actorId: context.user.id,
        action: "employment.create",
        entity: "employment",
        entityId: employment.id,
        summary: `Added employment ${employment.employer}`,
        ipAddress: context.ipAddress,
      });

      return employment;
    }),

  deleteEmployment: requirePermission("alumni.write")
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await context.db.employment.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  addTracking: requirePermission("tracking.write")
    .input(trackingInputSchema)
    .handler(async ({ context, input }) => {
      const event = await context.db.trackingEvent.create({
        data: {
          alumniId: input.alumniId,
          isTracked: input.isTracked,
          notes: input.notes ?? "",
          source: input.source ?? "manual",
          createdById: context.user.id,
        },
      });

      await context.db.alumni.update({
        where: { id: input.alumniId },
        data: {
          isTracked: input.isTracked,
          lastTrackedAt: input.isTracked ? new Date() : null,
        },
      });

      await writeAudit(context.db, {
        actorId: context.user.id,
        action: "tracking.create",
        entity: "alumni",
        entityId: input.alumniId,
        summary: input.isTracked ? "Marked alumni as tracked" : "Marked alumni as untracked",
        ipAddress: context.ipAddress,
      });

      return event;
    }),
};
