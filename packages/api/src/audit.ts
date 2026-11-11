import type { Database } from "@Alumni-Tracking-Ss/db";
import type { PermissionKey } from "@Alumni-Tracking-Ss/db";

const auditedFields = new Set([
  "code",
  "name",
  "description",
  "firstName",
  "middleName",
  "lastName",
  "suffix",
  "email",
  "phoneNumber",
  "gender",
  "facebookAccount",
  "studentNumber",
  "programId",
  "departmentId",
  "graduationYear",
  "mobileNumber",
  "personalEmail",
  "isTracked",
  "employer",
  "jobTitle",
  "industry",
  "location",
  "startDate",
  "endDate",
  "isCurrent",
  "status",
  "notes",
  "roleIds",
  "roleNames",
  "permissionKeys",
  "enabled",
  "alumniId",
  "collegeId",
  "employeeNumber",
  "roleLevel",
  "active",
  "assignedFacultyId",
  "batch",
  "type",
  "value",
  "label",
  "isPrimary",
]);

export type FieldChange = { field: string; old: unknown; new: unknown };

/** Structured old/new pairs for audited fields that actually changed; stored in metadata.changes. */
export function fieldChanges(before: object, after: Record<string, unknown>): FieldChange[] {
  const previous = before as Record<string, unknown>;
  const render = (value: unknown) => JSON.stringify(value ?? null);
  return Object.entries(after)
    .filter(
      ([key, value]) =>
        auditedFields.has(key) && value !== undefined && render(previous[key]) !== render(value),
    )
    .map(([field, value]) => ({
      field,
      old: previous[field] === undefined ? null : JSON.parse(render(previous[field])),
      new: JSON.parse(render(value)),
    }));
}

export function describeAuditChanges(before: object, after: Record<string, unknown>) {
  const previous = before as Record<string, unknown>;
  const render = (value: unknown) => JSON.stringify(value ?? null);
  return (
    Object.entries(after)
      .filter(
        ([key, value]) =>
          auditedFields.has(key) && value !== undefined && render(previous[key]) !== render(value),
      )
      .map(([key, value]) => `${key}: ${render(previous[key])} → ${render(value)}`)
      .join("; ") || "No audited fields changed."
  );
}

export async function writeAudit(
  db: Pick<Database, "AuditLog" | "UserRole" | "Role">,
  input: {
    actor?: { id: string; name: string; email: string } | null;
    actorId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    summary?: string;
    metadata?: Record<string, unknown> | null;
    ipAddress?: string | null;
  },
) {
  let actorRoles: string[] = [];
  if (input.actor) {
    // Load actor's role names at event time
    const userRoles = await db.UserRole.find({ userId: input.actor.id }).lean().exec();
    const roleIds = userRoles.map((ur) => (ur as unknown as { roleId: string }).roleId);
    if (roleIds.length > 0) {
      const roles = await db.Role.find({ _id: { $in: roleIds } })
        .lean()
        .exec();
      actorRoles = (roles as unknown as { name: string }[]).map((r) => r.name).sort();
    }
  }

  await db.AuditLog.create({
    actorId: input.actor?.id ?? input.actorId ?? undefined,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? undefined,
    summary: input.summary ?? "",
    metadata: input.actor
      ? {
          ...input.metadata,
          actorSnapshot: {
            id: input.actor.id,
            name: input.actor.name,
            email: input.actor.email,
            roles: actorRoles,
          },
        }
      : (input.metadata ?? undefined),
    ipAddress: input.ipAddress ?? undefined,
  });
}

export function hasPermission(permissions: readonly string[], needed: PermissionKey) {
  return permissions.includes(needed);
}
