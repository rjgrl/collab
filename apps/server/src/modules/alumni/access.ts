import { toEntity, type Database } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { requireAccess } from "@Alumni-Tracking-Ss/api/access";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";

export async function activeAlumni(db: Database, id: string) {
  const row = await db.Alumni.findOne({ _id: id, deletedAt: null }).lean();
  if (!row) throw new ApiError("NOT_FOUND", { message: "Alumni record not found." });
  return toEntity(row);
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
