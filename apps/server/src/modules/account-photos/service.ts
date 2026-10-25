import { randomBytes } from "node:crypto";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { requireAccess, rejectAlumniManagement } from "@Alumni-Tracking-Ss/api/access";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { writeAudit } from "@Alumni-Tracking-Ss/api/audit";
import {
  readPrivateFile,
  storeFile,
  validateEvidence,
} from "@Alumni-Tracking-Ss/api/integrations/files";
import { isIntegrationEnabled } from "@Alumni-Tracking-Ss/api/integrations/registry";
import {
  ACCOUNT_PHOTO_TYPES,
  MAX_ACCOUNT_PHOTO_BYTES,
} from "@Alumni-Tracking-Ss/contracts/account-photo";

export function accountPhotoUrl(userId: string, id: string) {
  return `/api/account-photos/${userId}/${id}`;
}

export async function uploadAccountPhoto(context: Context, file?: Express.Multer.File) {
  const user = requireAccess(context);
  if (!file) throw new ApiError("BAD_REQUEST", { message: "Choose a profile photo." });
  if (file.size > MAX_ACCOUNT_PHOTO_BYTES || file.buffer.length > MAX_ACCOUNT_PHOTO_BYTES)
    throw new ApiError("PAYLOAD_TOO_LARGE", { message: "Photo must be 10 MB or smaller." });
  if (
    !file.originalname.trim() ||
    file.originalname.length > 160 ||
    /[/\\\p{Cc}]/u.test(file.originalname)
  )
    throw new ApiError("BAD_REQUEST", {
      message: "Choose a file with a valid name of at most 160 characters.",
    });
  if (
    !(ACCOUNT_PHOTO_TYPES as readonly string[]).includes(file.mimetype) ||
    !(await validateEvidence(file.buffer, file.mimetype))
  )
    throw new ApiError("BAD_REQUEST", { message: "Choose a valid JPEG, PNG, WebP, or GIF photo." });
  const storageEnv = { ...context.integrationEnv };
  if (!(await isIntegrationEnabled(context.db, "google_drive")))
    storageEnv.googleServiceAccountJson = undefined;
  // Account photos must remain behind authenticated delivery, including when an image host is configured.
  const stored = await storeFile(storageEnv, {
    buffer: file.buffer,
    mimeType: file.mimetype,
    originalName: file.originalname,
  });
  const id = randomBytes(12).toString("hex");
  const image = accountPhotoUrl(user.id, id);
  return context.db.transaction(async (db) => {
    const owner = await db.User.findOne({ _id: user.id, status: "active" }).lean();
    if (!owner) throw new ApiError("FORBIDDEN");
    await db.User.updateOne({ _id: user.id, status: "active" }, { $set: { image } });
    const previousId = owner.image?.match(
      /^\/api\/account-photos\/[a-f\d]{24}\/([a-f\d]{24})$/i,
    )?.[1];
    if (previousId)
      await db.AccountPhoto.updateOne(
        { _id: previousId, userId: user.id, deletedAt: null },
        { $set: { deletedAt: new Date() } },
      );
    await db.AccountPhoto.create({
      _id: id,
      userId: user.id,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.buffer.length,
      ...stored,
    });
    if (owner.alumniId)
      await db.Alumni.updateOne(
        { _id: owner.alumniId, deletedAt: null },
        { $set: { photoUrl: image } },
      );
    await writeAudit(db, {
      actor: user,
      action: "account.photo.upload",
      entity: "account",
      entityId: user.id,
      summary: "Updated account profile photo.",
      ipAddress: context.ipAddress,
    });
    return { image };
  });
}

export async function removeAccountPhoto(context: Context) {
  const user = requireAccess(context);
  return context.db.transaction(async (db) => {
    const owner = await db.User.findOne({ _id: user.id, status: "active" }).lean();
    if (!owner) throw new ApiError("FORBIDDEN");
    await db.User.updateOne({ _id: user.id, status: "active" }, { $set: { image: null } });
    const previousId = owner.image?.match(
      /^\/api\/account-photos\/[a-f\d]{24}\/([a-f\d]{24})$/i,
    )?.[1];
    if (previousId)
      await db.AccountPhoto.updateOne(
        { _id: previousId, userId: user.id, deletedAt: null },
        { $set: { deletedAt: new Date() } },
      );
    if (owner.alumniId)
      await db.Alumni.updateOne({ _id: owner.alumniId }, { $set: { photoUrl: null } });
    await writeAudit(db, {
      actor: user,
      action: "account.photo.remove",
      entity: "account",
      entityId: user.id,
      summary: "Removed account profile photo.",
      ipAddress: context.ipAddress,
    });
    return { image: null };
  });
}

export async function downloadAccountPhoto(context: Context, userId: string, id: string) {
  const viewer = requireAccess(context);
  if (viewer.id !== userId) rejectAlumniManagement(context);
  const owner = await context.db.User.findOne({
    _id: userId,
    status: "active",
    image: accountPhotoUrl(userId, id),
  }).lean();
  if (!owner) throw new ApiError("NOT_FOUND", { message: "Photo not found." });
  if (viewer.id !== userId && !viewer.permissions.includes("users.read")) {
    requireAccess(context, "alumni.read");
    if (
      !owner.alumniId ||
      !(await context.db.Alumni.exists({ _id: owner.alumniId, deletedAt: null }))
    )
      throw new ApiError("FORBIDDEN");
  }
  const photo = await context.db.AccountPhoto.findOne({ _id: id, userId, deletedAt: null }).lean();
  if (!photo) throw new ApiError("NOT_FOUND", { message: "Photo not found." });
  try {
    return {
      buffer: await readPrivateFile(context.integrationEnv, { ...photo, url: photo.url ?? null }),
      mimeType: photo.mimeType,
    };
  } catch {
    throw new ApiError("NOT_FOUND", { message: "Photo is unavailable." });
  }
}
