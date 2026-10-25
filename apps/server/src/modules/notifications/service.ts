import { toEntity, type Database } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { requireAccess } from "@Alumni-Tracking-Ss/api/access";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { notificationsSchemas } from "@Alumni-Tracking-Ss/contracts/notifications";
import type { z } from "zod";

// The caller's transaction commits the evidence and its Staff notifications together.
export async function notifyStaffOfEvidence(
  db: Database,
  input: {
    alumniId: string;
    evidenceId: string;
    alumniName: string;
    studentNumber: string;
    originalName: string;
  },
) {
  const role = await db.Role.findOne({ key: "staff" }).lean();
  if (!role) return;
  const assignments = await db.UserRole.find({ roleId: role._id }).lean();
  const recipients = await db.User.find({
    _id: { $in: assignments.map((assignment) => assignment.userId) },
    status: "active",
  })
    .select("_id")
    .lean();
  if (recipients.length)
    await db.Notification.insertMany(
      recipients.map((recipient) => ({
        recipientId: recipient._id,
        alumniId: input.alumniId,
        evidenceId: input.evidenceId,
        summary: `${input.alumniName} (${input.studentNumber}) uploaded ${input.originalName} for tracking review.`,
        readAt: null,
      })),
      { ordered: true },
    );
}

function canReview(user: NonNullable<Context["user"]>) {
  return (
    user.roles.includes("staff") &&
    user.permissions.includes("alumni.read") &&
    user.permissions.includes("files.read")
  );
}
export const notificationsService = {
  async list(context: Context, _input: z.infer<typeof notificationsSchemas.list.input>) {
    const user = requireAccess(context);
    if (!canReview(user)) return { items: [], unreadCount: 0 };
    const [rows, unreadCount] = await Promise.all([
      context.db.Notification.find({ recipientId: user.id })
        .sort({ readAt: 1, createdAt: -1, _id: -1 })
        .limit(20)
        .lean(),
      context.db.Notification.countDocuments({ recipientId: user.id, readAt: null }),
    ]);
    return {
      items: rows.map((row) => ({ ...toEntity(row), readAt: row.readAt ?? null })),
      unreadCount,
    };
  },
  async markRead(context: Context, input: z.infer<typeof notificationsSchemas.markRead.input>) {
    const user = requireAccess(context);
    if (!canReview(user))
      throw new ApiError("FORBIDDEN", { message: "Staff review access is required." });
    const filter = { _id: input.id, recipientId: user.id };
    if (!(await context.db.Notification.exists(filter)))
      throw new ApiError("NOT_FOUND", { message: "Notification not found." });
    await context.db.Notification.updateOne(
      { ...filter, readAt: null },
      { $set: { readAt: new Date() } },
    );
    return { ok: true };
  },
};
