import type { Database } from "@Alumni-Tracking-Ss/db";
import type { PermissionKey } from "@Alumni-Tracking-Ss/db";

export async function writeAudit(
  db: Database,
  input: {
    actorId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    summary?: string;
    metadata?: Record<string, unknown> | null;
    ipAddress?: string | null;
  },
) {
  await db.auditLog.create({
    data: {
      actorId: input.actorId ?? undefined,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? undefined,
      summary: input.summary ?? "",
      metadata: (input.metadata ?? undefined) as never,
      ipAddress: input.ipAddress ?? undefined,
    },
  });
}

export function hasPermission(permissions: PermissionKey[], needed: PermissionKey) {
  return permissions.includes(needed);
}
