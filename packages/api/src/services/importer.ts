import type { Database } from "@Alumni-Tracking-Ss/db";
import { withNotDeleted } from "@Alumni-Tracking-Ss/db";
import { alumniImportRowSchema } from "../validation";
import type { AlumniImportRow } from "../validation";

export async function importAlumniRows(
  db: Database,
  rows: unknown[],
  options: { markTrackedFromRow?: boolean } = {},
) {
  const errors: Array<{ row: number; message: string }> = [];
  let successCount = 0;

  for (const [index, raw] of rows.entries()) {
    const parsed = alumniImportRowSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push({
        row: index + 1,
        message: parsed.error.issues.map((issue) => issue.message).join("; "),
      });
      continue;
    }

    try {
      await upsertImportedAlumni(db, parsed.data, options.markTrackedFromRow ?? true);
      successCount += 1;
    } catch (error) {
      errors.push({
        row: index + 1,
        message: error instanceof Error ? error.message : "Unable to import row",
      });
    }
  }

  return {
    totalRows: rows.length,
    successCount,
    errorCount: errors.length,
    errors,
  };
}

async function upsertImportedAlumni(
  db: Database,
  row: AlumniImportRow,
  useTrackedFlag: boolean,
) {
  const department = await db.department.findFirst({
    where: withNotDeleted({ code: row.departmentCode }),
  });
  if (!department) {
    throw new Error(`Unknown department code: ${row.departmentCode}`);
  }

  const program = await db.program.findFirst({
    where: withNotDeleted({
      departmentId: department.id,
      code: row.programCode,
    }),
  });
  if (!program) {
    throw new Error(`Unknown program code ${row.programCode} in ${row.departmentCode}`);
  }

  const existing = await db.alumni.findUnique({
    where: { studentNumber: row.studentNumber },
  });

  const data = {
    firstName: row.firstName,
    lastName: row.lastName,
    middleName: row.middleName,
    gender: row.gender,
    graduationYear: row.graduationYear,
    batch: row.batch,
    mobileNumber: row.mobileNumber,
    personalEmail: row.personalEmail || undefined,
    facebookAccount: row.facebookAccount,
    programId: program.id,
    isTracked: useTrackedFlag ? row.isTracked : existing?.isTracked ?? false,
    lastTrackedAt: useTrackedFlag && row.isTracked ? new Date() : existing?.lastTrackedAt,
  };

  if (existing) {
    await db.alumni.update({
      where: { id: existing.id },
      data,
    });
    return existing.id;
  }

  const created = await db.alumni.create({
    data: {
      studentNumber: row.studentNumber,
      ...data,
    },
  });

  if (data.isTracked) {
    await db.trackingEvent.create({
      data: {
        alumniId: created.id,
        isTracked: true,
        source: "import",
        notes: "Imported as tracked",
      },
    });
  }

  return created.id;
}
