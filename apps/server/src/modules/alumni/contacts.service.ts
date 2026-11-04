import {
  contactInputSchema,
  contactsSchemas,
  type ContactType,
} from "@Alumni-Tracking-Ss/contracts/contacts";
import { toEntity, type Database } from "@Alumni-Tracking-Ss/db";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { fieldChanges } from "@Alumni-Tracking-Ss/api/audit";
import { scopedAlumni } from "@Alumni-Tracking-Ss/api/scope";
import { formatDisplayName } from "@Alumni-Tracking-Ss/contracts/names";
import type { z } from "zod";
import { audit, management } from "../academic/service";

const MAX_CONTACTS = 50;
type Input<K extends keyof typeof contactsSchemas> = z.input<(typeof contactsSchemas)[K]["input"]>;

export async function alumniContacts(db: Database, alumniIds: string[], primaryOnly = false) {
  const rows = await db.AlumniContact.find({
    alumniId: { $in: alumniIds },
    ...(primaryOnly ? { isPrimary: true } : {}),
  })
    .sort({ type: 1, isPrimary: -1, createdAt: 1, _id: 1 })
    .lean();
  return rows.map((row) => {
    const c = toEntity(row);
    return { ...c, alumniId: String(c.alumniId) };
  });
}

/** Clears any other primary of the same type first, so the partial unique index never trips. */
async function demoteOthers(tx: Database, alumniId: string, type: ContactType, keepId?: string) {
  await tx.AlumniContact.updateMany(
    { alumniId, type, isPrimary: true, ...(keepId ? { _id: { $ne: keepId } } : {}) },
    { $set: { isPrimary: false } },
  );
}

export const contactsService = {
  async create(context: Context, input: Input<"create">) {
    const user = management(context, "alumni.write");
    const { alumniId, ...contact } = contactsSchemas.create.input.parse(input);
    return context.db.transaction(async (tx) => {
      const alumni = await scopedAlumni(context, alumniId, tx);
      if ((await tx.AlumniContact.countDocuments({ alumniId })) >= MAX_CONTACTS)
        throw new ApiError("BAD_REQUEST", {
          message: `An alumnus can have at most ${MAX_CONTACTS} contacts.`,
        });
      if (await tx.AlumniContact.exists({ alumniId, type: contact.type, value: contact.value }))
        throw new ApiError("CONFLICT", { message: "This contact is already on the profile." });
      // The first contact of a type becomes primary automatically.
      const isPrimary =
        contact.isPrimary || !(await tx.AlumniContact.exists({ alumniId, type: contact.type }));
      if (isPrimary) await demoteOthers(tx, alumniId, contact.type);
      const row = toEntity(
        (
          await tx.AlumniContact.create({ ...contact, isPrimary, alumniId, createdById: user.id })
        ).toObject(),
      );
      await audit(
        tx,
        context,
        "contacts.create",
        "alumni_contact",
        row.id,
        `Added ${contact.type} contact to ${JSON.stringify(formatDisplayName(alumni))} (${alumni.studentNumber})`,
        {
          alumniId,
          changes: fieldChanges(
            {},
            { type: row.type, value: row.value, label: row.label, isPrimary },
          ),
        },
      );
      return { ...row, alumniId };
    });
  },

  async update(context: Context, input: Input<"update">) {
    management(context, "alumni.write");
    const { alumniId, id, ...changes } = contactsSchemas.update.input.parse(input);
    return context.db.transaction(async (tx) => {
      const alumni = await scopedAlumni(context, alumniId, tx);
      const before = await tx.AlumniContact.findOne({ _id: id, alumniId }).lean();
      if (!before) throw new ApiError("NOT_FOUND", { message: "Contact not found." });
      const parsed = contactInputSchema.parse({
        type: before.type,
        value: changes.value ?? before.value,
        label: changes.label ?? before.label,
        isPrimary: changes.isPrimary ?? before.isPrimary,
      });
      if (
        parsed.value !== before.value &&
        (await tx.AlumniContact.exists({
          alumniId,
          type: before.type,
          value: parsed.value,
          _id: { $ne: id },
        }))
      )
        throw new ApiError("CONFLICT", { message: "This contact is already on the profile." });
      if (parsed.isPrimary && !before.isPrimary) await demoteOthers(tx, alumniId, before.type, id);
      const next = { value: parsed.value, label: parsed.label, isPrimary: parsed.isPrimary };
      const row = await tx.AlumniContact.findOneAndUpdate(
        { _id: id, alumniId },
        { $set: next },
        { returnDocument: "after", runValidators: true },
      )
        .lean()
        .orFail();
      await audit(
        tx,
        context,
        "contacts.update",
        "alumni_contact",
        id,
        `Updated ${before.type} contact of ${JSON.stringify(formatDisplayName(alumni))} (${alumni.studentNumber})`,
        { alumniId, changes: fieldChanges(before, next) },
      );
      return { ...toEntity(row), alumniId };
    });
  },

  async delete(context: Context, input: Input<"delete">) {
    management(context, "alumni.write");
    const { alumniId, id } = contactsSchemas.delete.input.parse(input);
    return context.db.transaction(async (tx) => {
      const alumni = await scopedAlumni(context, alumniId, tx);
      const before = await tx.AlumniContact.findOneAndDelete({ _id: id, alumniId }).lean();
      if (!before) throw new ApiError("NOT_FOUND", { message: "Contact not found." });
      await audit(
        tx,
        context,
        "contacts.delete",
        "alumni_contact",
        id,
        `Removed ${before.type} contact from ${JSON.stringify(formatDisplayName(alumni))} (${alumni.studentNumber})`,
        {
          alumniId,
          changes: fieldChanges(before, { type: null, value: null, label: null, isPrimary: null }),
        },
      );
      return { ok: true };
    });
  },
};
