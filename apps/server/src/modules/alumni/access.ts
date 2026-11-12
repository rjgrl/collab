import { toEntity, type Database } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { requireAccess } from "@Alumni-Tracking-Ss/api/access";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";

export async function activeAlumni(db: Database, id: string) {
  const row = await db.Alumni.findOne({ _id: id, deletedAt: null }).lean();
  if (!row) throw new ApiError("NOT_FOUND", { message: "Alumni record not found." });
  return toEntity(row);
}
/** Managed photo changes: Super Admins, or the active faculty record directly assigned to this alumnus. */
export async function canManageAlumniPhoto(
  context: Context,
  alumni: { assignedFacultyId?: unknown },
  db = context.db,
) {
  const user = requireAccess(context);
  if (user.roles.includes("super_admin")) return true;
  if (!alumni.assignedFacultyId) return false;
  const faculty = await db.Faculty.findOne({ userId: user.id, deletedAt: null })
    .select("_id")
    .lean();
  return Boolean(faculty && String(faculty._id) === String(alumni.assignedFacultyId));
}
export async function assertCanManageAlumniPhoto(
  context: Context,
  alumni: { assignedFacultyId?: unknown },
  db = context.db,
) {
  if (!(await canManageAlumniPhoto(context, alumni, db)))
    throw new ApiError("FORBIDDEN", {
      message: "Only a Super Admin or the assigned faculty tracker can change this photo.",
    });
}
export async function linkedAlumni(context: Context, db = context.db) {
  const user = requireAccess(context);
  const owner = await db.User.findOne({ _id: user.id, status: "active" }).select("alumniId").lean();
  if (!owner?.alumniId)
    throw new ApiError("CONFLICT", {
      message: "Your account must be linked to an alumni profile by an administrator.",
    });
  return activeAlumni(db, String(owner.alumniId));
}
