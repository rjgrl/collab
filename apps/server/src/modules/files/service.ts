import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { requireAccess, rejectAlumniManagement } from "@Alumni-Tracking-Ss/api/access";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { writeAudit } from "@Alumni-Tracking-Ss/api/audit";
import { toEntity } from "@Alumni-Tracking-Ss/db";
import { isIntegrationEnabled } from "@Alumni-Tracking-Ss/api/integrations/registry";
import {
  ALLOWED_EVIDENCE_TYPES,
  MAX_EVIDENCE_BYTES,
  readPrivateFile,
  storeFile,
  validateEvidence,
} from "@Alumni-Tracking-Ss/api/integrations/files";
import { objectIdSchema } from "@Alumni-Tracking-Ss/contracts/common";
import { z } from "zod";
import { assertEvidenceReadAccess } from "../alumni/service";
import { linkedAlumni } from "../alumni/access";
import { isAlumniAccount, formatDisplayName } from "@Alumni-Tracking-Ss/contracts/names";
import { notifyStaffOfEvidence } from "../notifications/service";

export const uploadInputSchema = z
  .object({
    alumniId: objectIdSchema,
    trackingEventId: z.preprocess(
      (value) => (value === "" ? undefined : value),
      objectIdSchema.optional(),
    ),
    kind: z.enum(["image", "evidence"]).default("evidence"),
    employmentId: objectIdSchema.optional(),
  })
  .strict();

export async function uploadEvidence(
  context: Context,
  input: z.infer<typeof uploadInputSchema>,
  file: Express.Multer.File | undefined,
  self = false,
) {
  const user = requireAccess(context, self ? undefined : "files.write");
  if (self) {
    if ((await linkedAlumni(context)).id !== input.alumniId) throw new ApiError("FORBIDDEN");
  } else rejectAlumniManagement(context);
  if (!file) throw new ApiError("BAD_REQUEST", { message: "Alumni and file are required." });
  if (
    !file.originalname.trim() ||
    file.originalname.length > 160 ||
    /[/\\\p{Cc}]/u.test(file.originalname)
  )
    throw new ApiError("BAD_REQUEST", {
      message: "Choose a file with a valid name of at most 160 characters.",
    });
  if (
    !ALLOWED_EVIDENCE_TYPES.has(file.mimetype) ||
    !(await validateEvidence(file.buffer, file.mimetype))
  )
    throw new ApiError("BAD_REQUEST", {
      message: "File contents do not match an allowed file type.",
    });
  if (file.size > MAX_EVIDENCE_BYTES)
    throw new ApiError("PAYLOAD_TOO_LARGE", { message: "File must be 10 MB or smaller." });
  if (input.kind === "image" && !file.mimetype.startsWith("image/"))
    throw new ApiError("BAD_REQUEST", { message: "Choose a supported profile image." });
  if (!(await context.db.Alumni.exists({ _id: input.alumniId, deletedAt: null })))
    throw new ApiError("NOT_FOUND", { message: "Alumni record not found." });
  if (
    input.employmentId &&
    !(await context.db.Employment.exists({ _id: input.employmentId, alumniId: input.alumniId }))
  )
    throw new ApiError("BAD_REQUEST", { message: "Employment does not belong to this profile." });
  if (
    input.trackingEventId &&
    !(await context.db.TrackingEvent.exists({
      _id: input.trackingEventId,
      alumniId: input.alumniId,
    }))
  )
    throw new ApiError("BAD_REQUEST", {
      message: "Tracking event does not belong to this alumni record.",
    });
  const storageEnv = { ...context.integrationEnv };
  if (!(await isIntegrationEnabled(context.db, "google_drive")))
    storageEnv.googleServiceAccountJson = undefined;
  if (!(await isIntegrationEnabled(context.db, "image_host"))) storageEnv.imgbbApiKey = undefined;
  const stored = await storeFile(storageEnv, {
    buffer: file.buffer,
    mimeType: file.mimetype,
    originalName: file.originalname,
    preferImageHost: input.kind === "image",
  });
  return context.db.transaction(async (db) => {
    // Serialize with employment edits and profile archival before checking job ownership.
    if (
      !(
        await db.Alumni.updateOne(
          { _id: input.alumniId, deletedAt: null },
          { $inc: { employmentRevision: 1 } },
        )
      ).matchedCount
    )
      throw new ApiError("NOT_FOUND", { message: "Alumni record not found." });
    if (self && (await linkedAlumni(context, db)).id !== input.alumniId)
      throw new ApiError("FORBIDDEN");
    if (
      input.employmentId &&
      !(await db.Employment.exists({ _id: input.employmentId, alumniId: input.alumniId }))
    )
      throw new ApiError("BAD_REQUEST", {
        message: "Employment changed. Select a current record.",
      });
    const evidence = await db.EvidenceFile.create({
      ...input,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      provider: stored.provider,
      storageKey: stored.storageKey,
      url: stored.url,
      createdById: user.id,
    });
    if (input.kind === "image")
      await db.Alumni.updateOne(
        { _id: input.alumniId, deletedAt: null },
        {
          $set: {
            photoUrl: stored.provider === "imgbb" ? stored.url : `/api/files/${evidence._id}`,
          },
        },
      );
    await writeAudit(db, {
      actor: user,
      action: "files.upload",
      entity: "evidence",
      entityId: evidence._id.toHexString(),
      summary: `Uploaded ${JSON.stringify(file.originalname)} (${file.mimetype}, ${file.size} bytes) to Alumni profile ${input.alumniId}${input.employmentId ? `, employment ${input.employmentId}` : ""}`,
      ipAddress: context.ipAddress,
    });
    if (self && isAlumniAccount(user) && input.kind === "evidence") {
      const alumni = await linkedAlumni(context, db);
      await notifyStaffOfEvidence(db, {
        alumniId: alumni.id,
        evidenceId: evidence._id.toHexString(),
        alumniName: formatDisplayName(alumni),
        studentNumber: alumni.studentNumber,
        originalName: evidence.originalName,
      });
    }
    return {
      id: evidence._id.toHexString(),
      originalName: evidence.originalName,
      mimeType: evidence.mimeType,
      sizeBytes: evidence.sizeBytes,
    };
  });
}

export async function downloadEvidence(context: Context, id: string, self = false) {
  requireAccess(context, self ? undefined : "files.read");
  const record = await context.db.EvidenceFile.findOne({ _id: id, deletedAt: null }).lean().exec();
  if (!record) throw new ApiError("NOT_FOUND", { message: "File not found." });
  if (self) {
    if ((await linkedAlumni(context)).id !== String(record.alumniId))
      throw new ApiError("FORBIDDEN", { message: "You may only read your own files." });
  } else await assertEvidenceReadAccess(context, record);
  if (!(await context.db.Alumni.exists({ _id: record.alumniId, deletedAt: null })))
    throw new ApiError("NOT_FOUND", { message: "File not found." });
  const evidence = toEntity(record);
  try {
    const buffer = await readPrivateFile(context.integrationEnv, {
      ...evidence,
      url: evidence.url ?? null,
    });
    return {
      buffer,
      mimeType: evidence.mimeType,
      name: evidence.originalName.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 160) || "download",
    };
  } catch {
    throw new ApiError("NOT_FOUND", { message: "File is unavailable." });
  }
}
