import { toEntity, type Database } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { alumniScopeFilter, managerScope } from "@Alumni-Tracking-Ss/api/scope";
import { requireUser, requireAccess } from "@Alumni-Tracking-Ss/api/access";
import { isAlumniAccount } from "@Alumni-Tracking-Ss/contracts/names";
import { auditSchemas, auditActorSchema } from "@Alumni-Tracking-Ss/contracts/audit";
import {
  AUDIT_ACTION_LABELS,
  renderAuditSummary,
} from "@Alumni-Tracking-Ss/contracts/audit-labels";
import {
  describeHistoryEntry,
  type HistoryChange,
  type TrackingDetails,
} from "@Alumni-Tracking-Ss/contracts/alumni-history";
import type { z } from "zod";
import { management, escapeRegex } from "../academic/service";
/**
 * Which audit entries the caller may read. Holders of `audit.read` (Administrators) see every
 * entry. Alumni accounts see their own entries. College and department heads see entries about
 * alumni in their scope (including contacts, assignments and tracking) and about faculty in
 * their departments. Others: none.
 */
async function auditScope(context: Context): Promise<Record<string, unknown>> {
  if (requireUser(context).permissions.includes("audit.read")) {
    management(context, "audit.read");
    return {};
  }
  const user = requireUser(context);
  if (isAlumniAccount(user)) {
    requireAccess(context);
    // Alumni see their own entries: entries they acted in, or entries about their alumni profile
    const filter: Record<string, unknown>[] = [{ actorId: user.id }];
    if (user.alumniId) {
      filter.push({ entity: "alumni", entityId: user.alumniId });
      filter.push({ "metadata.alumniId": user.alumniId });
    }
    return { $or: filter };
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

/** Entries about one alumnus (profile, contacts, employment, files, tracking). */
function alumniRelated(row: { entity: string }, metadata: Record<string, unknown> | null): boolean {
  return row.entity === "alumni" || typeof metadata?.alumniId === "string";
}
/** Same plain language as the alumni Change history: values, not `none → "x"` pairs or IDs. */
function readableAlumniSummary(
  row: { action: string; entity: string; summary: string },
  metadata: Record<string, unknown> | null,
) {
  const described = describeHistoryEntry({
    action: row.action,
    entity: row.entity,
    summary: row.summary,
    changes: (Array.isArray(metadata?.changes) ? metadata.changes : []) as HistoryChange[],
    tracking:
      metadata?.tracking && typeof metadata.tracking === "object"
        ? (metadata.tracking as TrackingDetails)
        : null,
  });
  return described.details.length ? described.details.join("; ") : described.title;
}
export const auditService = {
  async list(context: Context, input?: z.input<typeof auditSchemas.list.input>) {
    const scope = await auditScope(context);
    const p = auditSchemas.list.input.parse(input) ?? { page: 1, pageSize: 20 };

    // Build search filter
    let q: Record<string, unknown> = {};
    if (p.search) {
      // Get all actions where the label contains the search term
      const matchingActions = Object.entries(AUDIT_ACTION_LABELS)
        .filter(([, label]) => label.toLowerCase().includes(p.search!.toLowerCase()))
        .map(([action]) => action);

      // Build $or filter for action, entity, summary, and action labels
      const orFilters: Record<string, unknown>[] = ["action", "entity", "summary"].map((k) => ({
        [k]: { $regex: escapeRegex(p.search!), $options: "i" },
      }));
      if (matchingActions.length > 0) {
        orFilters.push({ action: { $in: matchingActions } });
      }
      q = { $or: orFilters };
    }

    const rows = await context.db.AuditLog.find({ $and: [q, scope] })
      .sort({ createdAt: -1, _id: -1 })
      .skip((p.page - 1) * p.pageSize)
      .limit(p.pageSize)
      .lean();

    // Load role and permission names once per request
    const roles = await context.db.Role.find({}).lean().exec();
    const roleMap: Record<string, string> = Object.fromEntries(
      (roles as unknown as Array<{ _id: string | { toString(): string }; name: string }>).map(
        (r) => [String(r._id), r.name],
      ),
    );

    const permissions = await context.db.Permission.find({}).lean().exec();
    const permissionMap: Record<string, string> = Object.fromEntries(
      (
        permissions as unknown as Array<{
          key: string;
          name: string;
        }>
      ).map((p) => [p.key, p.name]),
    );

    const names = { roles: roleMap, permissions: permissionMap };

    return Promise.all(
      rows.map(async (raw) => {
        const row = toEntity(raw);
        const metadata = row.metadata as Record<string, unknown> | null;
        const actorSnapshot = metadata?.actorSnapshot as Record<string, unknown> | null | undefined;
        const recorded = auditActorSchema.safeParse(actorSnapshot);
        const actor =
          !recorded.success && row.actorId
            ? await context.db.User.findById(row.actorId).select("_id name email").lean()
            : null;
        const actorRoles =
          Array.isArray(actorSnapshot?.roles) &&
          actorSnapshot.roles.every((r: unknown) => typeof r === "string")
            ? (actorSnapshot.roles as string[])
            : null;
        return {
          ...row,
          actorId: row.actorId ?? null,
          actorIsSnapshot: recorded.success,
          actor: recorded.success ? recorded.data : actor ? toEntity(actor) : null,
          actorRoles,
          displaySummary: alumniRelated(row, metadata)
            ? readableAlumniSummary(row, metadata)
            : renderAuditSummary(row as { entity: string; summary: string }, names),
        };
      }),
    );
  },
};
