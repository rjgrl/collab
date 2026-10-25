import { toEntity } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { auditSchemas, auditActorSchema } from "@Alumni-Tracking-Ss/contracts/audit";
import type { z } from "zod";
import { management, escapeRegex } from "../academic/service";
export const auditService = {
  async list(context: Context, input?: z.input<typeof auditSchemas.list.input>) {
    management(context, "audit.read");
    const p = auditSchemas.list.input.parse(input) ?? { page: 1, pageSize: 20 };
    const q = p.search
      ? {
          $or: ["action", "entity", "summary"].map((k) => ({
            [k]: { $regex: escapeRegex(p.search!), $options: "i" },
          })),
        }
      : {};
    const rows = await context.db.AuditLog.find(q)
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
