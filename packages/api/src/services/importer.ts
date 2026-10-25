import type { Database } from "@Alumni-Tracking-Ss/db";
import { toEntity } from "@Alumni-Tracking-Ss/db";
import { alumniImportRowSchema } from "../validation";
import type { AlumniImportRow } from "../validation";
import { structuredNameSchema } from "@Alumni-Tracking-Ss/contracts/names";
import { mobileSchema, facebookSchema } from "@Alumni-Tracking-Ss/contracts/alumni";
import { writeAudit, describeAuditChanges } from "../audit";
export class ImportRowError extends Error {}
export async function importAlumniRows(
  db: Database,
  rows: unknown[],
  options: { markTrackedFromRow?: boolean; actorId?: string } = {},
) {
  const errors: Array<{ row: number; message: string }> = [];
  let successCount = 0;
  for (const [index, raw] of rows.entries()) {
    const parsed = alumniImportRowSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push({
        row: index + 1,
        message: parsed.error.issues.map((i) => i.message).join("; "),
      });
      continue;
    }
    try {
      await db.transaction((tx) =>
        upsertImportedAlumni(tx, parsed.data, options.markTrackedFromRow ?? true, options.actorId),
      );
      successCount++;
    } catch (error) {
      errors.push({
        row: index + 1,
        message:
          error instanceof ImportRowError
            ? error.message
            : "Unable to import row. Try again or contact an administrator.",
      });
    }
  }
  return { totalRows: rows.length, successCount, errorCount: errors.length, errors };
}
export async function upsertImportedAlumni(
  db: Database,
  row: AlumniImportRow,
  useTrackedFlag: boolean,
  actorId?: string,
) {
  const namesValid = structuredNameSchema.safeParse(row);
  if (!namesValid.success)
    throw new ImportRowError(namesValid.error.issues.map((issue) => issue.message).join("; "));
  if (
    !mobileSchema.safeParse(row.mobileNumber).success ||
    !facebookSchema.safeParse(row.facebookAccount).success
  )
    throw new ImportRowError("Invalid imported contact details.");
  if (row.graduationYear !== undefined && (row.graduationYear < 1950 || row.graduationYear > 2100))
    throw new ImportRowError("Graduation year must be between 1950 and 2100.");
  const departments = await db.Department.find({
    deletedAt: null,
    name: row.departmentName,
  })
    .limit(2)
    .lean();
  if (!departments.length)
    throw new ImportRowError("Unknown department name: " + row.departmentName);
  if (departments.length > 1)
    throw new ImportRowError("Ambiguous department name: " + row.departmentName);
  const department = departments[0]!;
  const program = await db.Program.findOne({
    deletedAt: null,
    departmentId: department._id,
    code: row.programCode,
  }).lean();
  if (!program)
    throw new ImportRowError(
      "Unknown program code " + row.programCode + " in " + row.departmentName,
    );
  const raw = await db.Alumni.findOne({ studentNumber: row.studentNumber }).lean();
  const existing = raw ? toEntity(raw) : null;
  if (existing?.deletedAt)
    throw new ImportRowError("This alumni record is archived. Ask an administrator to review it.");
  const linked = existing ? await db.User.findOne({ alumniId: existing.id }).lean() : null;
  const names = linked
    ? {
        firstName: linked.firstName ?? existing!.firstName,
        lastName: linked.lastName ?? existing!.lastName,
        middleName: linked.middleName ?? existing!.middleName,
        suffix: linked.suffix ?? existing!.suffix,
      }
    : {
        firstName: row.firstName,
        lastName: row.lastName,
        middleName: row.middleName,
        suffix: row.suffix ?? existing?.suffix ?? "",
      };
  const trackingSupplied = useTrackedFlag && row.isTracked !== undefined;
  const tracked = trackingSupplied ? row.isTracked : (existing?.isTracked ?? false);
  const data = {
    ...names,
    gender: linked ? (linked.gender ?? existing?.gender) : row.gender,
    graduationYear: row.graduationYear,
    mobileNumber: linked ? (linked.phoneNumber ?? existing?.mobileNumber) : row.mobileNumber,
    personalEmail: linked
      ? (linked.email ?? existing?.personalEmail)
      : row.personalEmail || undefined,
    facebookAccount: linked
      ? (linked.facebookAccount ?? existing?.facebookAccount)
      : row.facebookAccount,
    programId: program._id,
    isTracked: tracked,
    lastTrackedAt: trackingSupplied ? (tracked ? new Date() : null) : existing?.lastTrackedAt,
  };
  const alumni = existing
    ? await db.Alumni.findOneAndUpdate(
        { _id: existing.id, deletedAt: null },
        { $set: data },
        { returnDocument: "after", runValidators: true },
      ).lean()
    : await db.Alumni.create({ studentNumber: row.studentNumber, ...data });
  if (!alumni) throw new ImportRowError("Alumni record changed during import.");
  const id = toEntity(alumni).id;
  if (trackingSupplied && (!existing ? tracked : existing.isTracked !== tracked))
    await db.TrackingEvent.create({
      alumniId: id,
      isTracked: tracked,
      source: "import",
      createdById: actorId,
      notes: tracked ? "Imported as tracked" : "Imported as untracked",
    });
  const actor = actorId ? await db.User.findById(actorId).select("_id name email").lean() : null;
  await writeAudit(db, {
    actor: actor ? toEntity(actor) : null,
    actorId,
    action: existing ? "alumni.import.update" : "alumni.import.create",
    entity: "alumni",
    entityId: id,
    summary: existing
      ? `Imported changes for Alumni ${row.studentNumber}: ${describeAuditChanges(existing, data)}`
      : `Imported Alumni ${row.studentNumber}: ${describeAuditChanges({}, { ...data, studentNumber: row.studentNumber })}`,
  });
  return id;
}
