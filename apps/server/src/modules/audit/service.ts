import { toEntity, type Database } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { alumniScopeFilter, managerScope } from "@Alumni-Tracking-Ss/api/scope";
import { requireUser } from "@Alumni-Tracking-Ss/api/access";
import { auditSchemas, auditActorSchema } from "@Alumni-Tracking-Ss/contracts/audit";
import type { z } from "zod";
import { management, escapeRegex } from "../academic/service";
/**
 * Which audit entries the caller may read. Holders of `audit.read` (Administrators) see every
 * entry. College and department heads see entries about alumni in their scope (including
 * contacts, assignments and tracking) and about faculty in their departments. Others: none.
 */
async function auditScope(context: Context): Promise<Record<string, unknown>> {
  if (requireUser(context).permissions.includes("audit.read")) {
    management(context, "audit.read");
    return {};
  }
  management(context, "alumni.read");
  const manager = await managerScope(context);
  if (!manager || manager.level === "admin")
    throw new ApiError("FORBIDDEN", { message: "Missing permission: audit.read" });
  return headAuditFilter(context.db, await alumniScopeFilter(context), manager.departmentIds);
}

export async function headAuditFilter(
  db: Database,
  alumniFilter: Record<string, unknown>,
  departmentIds: string[],
) {
  const alumniIds = (await db.Alumni.find(alumniFilter).select("_id").lean()).map((row) =>
    String(row._id),
  );
  const facultyIds = (
    await db.Faculty.find({ departmentId: { $in: departmentIds } })
      .select("_id")
      .lean()
  ).map((row) => String(row._id));
  return {
    $or: [
      { entity: "alumni", entityId: { $in: alumniIds } },
      { "metadata.alumniId": { $in: alumniIds } },
      { entity: "faculty", entityId: { $in: facultyIds } },
    ],
  };
}

export const auditService = {
  async list(context: Context, input?: z.input<typeof auditSchemas.list.input>) {
    const scope = await auditScope(context);
    const p = auditSchemas.list.input.parse(input) ?? { page: 1, pageSize: 20 };
    const q = p.search
      ? {
          $or: ["action", "entity", "summary"].map((k) => ({
            [k]: { $regex: escapeRegex(p.search!), $options: "i" },
          })),
        }
      : {};
    const rows = await context.db.AuditLog.find({ $and: [q, scope] })
      .sort({ createdAt: -1, _id: -1 })
      .skip((p.page - 1) * p.pageSize)
      .limit(p.pageSize)
      .lean();
    return Promise.all(
      rows.map(async (raw) => {
        const row = toEntity(raw);
        const recorded = auditActorSchema.safeParse(
          (row.metadata as Record<string, unknown> | null)?.actorSnapshot,
        );
        const actor =
          !recorded.success && row.actorId
            ? await context.db.User.findById(row.actorId).select("_id name email").lean()
            : null;
        return {
          ...row,
          actorId: row.actorId ?? null,
          actorIsSnapshot: recorded.success,
          actor: recorded.success ? recorded.data : actor ? toEntity(actor) : null,
        };
      }),
    );
  },
};
