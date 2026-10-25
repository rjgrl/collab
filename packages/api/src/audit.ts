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
  "permissionKeys",
  "enabled",
  "alumniId",
]);

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
  db: Pick<Database, "AuditLog">,
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
  await db.AuditLog.create({
    actorId: input.actor?.id ?? input.actorId ?? undefined,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? undefined,
    summary: input.summary ?? "",
    metadata: input.actor
      ? {
          ...input.metadata,
          actorSnapshot: { id: input.actor.id, name: input.actor.name, email: input.actor.email },
        }
      : (input.metadata ?? undefined),
    ipAddress: input.ipAddress ?? undefined,
  });
}

export function hasPermission(permissions: readonly string[], needed: PermissionKey) {
  return permissions.includes(needed);
}
