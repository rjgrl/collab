import { toEntity, type Database } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { requireAccess } from "@Alumni-Tracking-Ss/api/access";
import { isAlumniAccount, isFacultyAccount } from "@Alumni-Tracking-Ss/contracts/names";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { notificationsSchemas } from "@Alumni-Tracking-Ss/contracts/notifications";
import type { z } from "zod";

/**
 * Who reviews an alumnus's evidence: the assigned faculty member, plus department heads of the
 * alumnus's department and college heads of its college. Only active, placed faculty with a
 * linked, active account are notified.
 */
async function evidenceReviewers(db: Database, alumniId: string) {
  const alumni = await db.Alumni.findById(alumniId).select("programId assignedFacultyId").lean();
  if (!alumni) return [];
  const program = await db.Program.findById(alumni.programId).select("departmentId").lean();
  const department = program
    ? await db.Department.findById(program.departmentId).select("collegeId").lean()
    : null;
  const collegeDepartments = department
    ? (await db.Department.find({ collegeId: department.collegeId }).select("_id").lean()).map(
        (row) => row._id,
      )
    : [];
  const or: Record<string, unknown>[] = [];
  if (alumni.assignedFacultyId) or.push({ _id: alumni.assignedFacultyId });
  if (department) {
    or.push({ roleLevel: "department", departmentId: department._id });
    or.push({ roleLevel: "college", departmentId: { $in: collegeDepartments } });
  }
  if (!or.length) return [];
  const faculty = await db.Faculty.find({
    $or: or,
    active: true,
    deletedAt: null,
    userId: { $ne: null },
  })
    .select("userId")
    .lean();
  const userIds = faculty.flatMap((row) => (row.userId ? [row.userId] : []));
  return db.User.find({ _id: { $in: userIds }, status: "active" })
    .select("_id")
    .lean();
}

// The caller's transaction commits the evidence and its reviewer notifications together.
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
  const recipients = await evidenceReviewers(db, input.alumniId);
  const summary = `${input.alumniName} (${input.studentNumber}) uploaded ${input.originalName} for tracking review.`;
  const fresh = [];
  for (const recipient of recipients) {
    // One unread notice per alumnus: a newer upload refreshes it instead of adding another.
    const grouped = await db.Notification.updateOne(
      { recipientId: recipient._id, alumniId: input.alumniId, readAt: null },
      {
        $set: {
          evidenceId: input.evidenceId,
          summary: `${input.alumniName} (${input.studentNumber}) uploaded new files for tracking review, most recently ${input.originalName}.`,
        },
      },
    ).exec();
    if (!grouped.matchedCount)
      fresh.push({
        recipientId: recipient._id,
        alumniId: input.alumniId,
        evidenceId: input.evidenceId,
        summary,
        readAt: null,
      });
  }
  if (fresh.length) await db.Notification.insertMany(fresh, { ordered: true });
}

// Only faculty accounts receive evidence notifications (see evidenceReviewers).
function canReview(user: NonNullable<Context["user"]>) {
  return (
    isFacultyAccount(user) &&
    !isAlumniAccount(user) &&
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
      throw new ApiError("FORBIDDEN", { message: "Reviewer access is required." });
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
