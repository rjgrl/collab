import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { toEntity, type Database } from "@Alumni-Tracking-Ss/db";
import { selfEmploymentInputSchema } from "@Alumni-Tracking-Ss/contracts/alumni";
import type { z } from "zod";
import { activeAlumni, linkedAlumni } from "./access";
import { audit, management } from "../academic/service";
import { describeAuditChanges } from "@Alumni-Tracking-Ss/api/audit";

async function claimProfile(context: Context, tx: Database, alumniId: string, self: boolean) {
  if (self) {
    if ((await linkedAlumni(context, tx)).id !== alumniId)
      throw new ApiError("FORBIDDEN", { message: "You may only change your own employment." });
  } else {
    management(context, "alumni.write");
    await activeAlumni(tx, alumniId);
  }
  // Serialize every job mutation through its parent, including concurrent new current jobs.
  const claim = await tx.Alumni.updateOne(
    { _id: alumniId, deletedAt: null },
    { $inc: { employmentRevision: 1 } },
  );
  if (claim.matchedCount !== 1) throw new ApiError("NOT_FOUND");
}
async function summarize(tx: Database, alumniId: string) {
  // Reconcile legacy flags only within this authorized profile mutation.
  await tx.Employment.updateMany(
    {
      alumniId,
      isCurrent: true,
      $or: [{ endDate: { $ne: null } }, { status: { $ne: "employed" } }],
    },
    { $set: { isCurrent: false } },
  );
  const current = await tx.Employment.findOne({ alumniId, isCurrent: true })
    .sort({ updatedAt: -1, _id: -1 })
    .lean();
  if (current)
    await tx.Employment.updateMany(
      { alumniId, isCurrent: true, _id: { $ne: current._id } },
      { $set: { isCurrent: false } },
    );
  const any = current || (await tx.Employment.exists({ alumniId }));
  await tx.Alumni.updateOne(
    { _id: alumniId, deletedAt: null },
    { $set: { employmentStatus: current?.status ?? (any ? "unemployed" : "unknown") } },
  );
}
function jobData(input: z.input<typeof selfEmploymentInputSchema>) {
  const data = selfEmploymentInputSchema.parse(input);
  return {
    ...data,
    startDate: data.startDate ? new Date(data.startDate) : null,
    endDate: data.endDate ? new Date(data.endDate) : null,
    jobTitle: data.jobTitle ?? "",
    industry: data.industry ?? "",
    location: data.location ?? "",
    notes: data.notes ?? "",
  };
}
export const employmentService = {
  async create(
    context: Context,
    input: z.input<typeof selfEmploymentInputSchema>,
    alumniId?: string,
  ) {
    const data = jobData(input);
    const self = alumniId === undefined;
    if (!self) management(context, "alumni.write");
    return context.db.transaction(async (tx) => {
      const ownerId = alumniId ?? (await linkedAlumni(context, tx)).id;
      await claimProfile(context, tx, ownerId, self);
      if (data.isCurrent)
        await tx.Employment.updateMany(
          { alumniId: ownerId, isCurrent: true },
          { $set: { isCurrent: false } },
        );
      const job = await tx.Employment.create({ ...data, alumniId: ownerId });
      await summarize(tx, ownerId);
      const result = toEntity(job.toObject());
      await audit(
        tx,
        context,
        self ? "employment.self.create" : "employment.create",
        "employment",
        result.id,
        `Added employment for Alumni ${ownerId}: ${describeAuditChanges({}, data)}`,
      );
      return result;
    });
  },
  async update(
    context: Context,
    id: string,
    input: z.input<typeof selfEmploymentInputSchema>,
    self = false,
  ) {
    const data = jobData(input);
    if (!self) management(context, "alumni.write");
    return context.db.transaction(async (tx) => {
      const existing = await tx.Employment.findById(id).lean();
      if (!existing) throw new ApiError("NOT_FOUND");
      const alumniId = String(existing.alumniId);
      await claimProfile(context, tx, alumniId, self);
      if (data.isCurrent)
        await tx.Employment.updateMany(
          { alumniId, _id: { $ne: id }, isCurrent: true },
          { $set: { isCurrent: false } },
        );
      const job = await tx.Employment.findOneAndUpdate(
        { _id: id, alumniId },
        { $set: data },
        { returnDocument: "after", runValidators: true },
      )
        .lean()
        .orFail();
      await summarize(tx, alumniId);
      await audit(
        tx,
        context,
        self ? "employment.self.update" : "employment.update",
        "employment",
        id,
        `Updated employment ${JSON.stringify(existing.employer)} for Alumni ${alumniId}: ${describeAuditChanges(existing, data)}`,
      );
      return toEntity(job);
    });
  },
  async remove(context: Context, id: string, self = false) {
    if (!self) management(context, "alumni.write");
    return context.db.transaction(async (tx) => {
      const job = await tx.Employment.findById(id).lean();
      if (!job) throw new ApiError("NOT_FOUND");
      const alumniId = String(job.alumniId);
      await claimProfile(context, tx, alumniId, self);
      await tx.EvidenceFile.updateMany({ employmentId: id }, { $unset: { employmentId: 1 } });
      await tx.Employment.deleteOne({ _id: id, alumniId });
      await summarize(tx, alumniId);
      await audit(
        tx,
        context,
        self ? "employment.self.delete" : "employment.delete",
        "employment",
        id,
        `Removed employment ${JSON.stringify(job.employer)} (${job.jobTitle ?? "no job title"}) from Alumni ${alumniId}; related evidence retained and unlinked`,
      );
      return { ok: true };
    });
  },
};
