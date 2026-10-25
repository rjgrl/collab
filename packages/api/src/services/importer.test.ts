import assert from "node:assert/strict";
import { it } from "node:test";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { upsertImportedAlumni, importAlumniRows, ImportRowError } from "./importer";
import { alumniImportRowSchema } from "../validation";

it("hides unexpected database errors from import results", async () => {
  const db = {
    Department: {
      find: () => {
        throw new Error("synthetic-database-private-path-and-query");
      },
    },
    transaction: async <T>(work: (tx: Database) => Promise<T>) => work(db as unknown as Database),
  };
  const result = await importAlumniRows(db as unknown as Database, [
    { ...row, departmentName: "COT" },
  ]);
  assert.equal(result.successCount, 0);
  assert.equal(result.errorCount, 1);
  assert.deepEqual(result.errors, [
    { row: 1, message: "Unable to import row. Try again or contact an administrator." },
  ]);
});

it("preserves actionable domain and schema validation errors in import results", async () => {
  const db = {
    Department: { find: () => ({ limit: () => query([]) }) },
    transaction: async <T>(work: (tx: Database) => Promise<T>) => work(db as unknown as Database),
  };
  const originalRow = { ...row, departmentName: "COT" };
  const result = await importAlumniRows(db as unknown as Database, [
    originalRow,
    { ...originalRow, gender: "" },
  ]);
  assert.equal(result.errorCount, 2);
  assert.equal(result.errors[0]?.message, "Unknown department name: COT");
  assert.match(result.errors[1]!.message, /Male|Female/);
});
const alumniId = "111111111111111111111111",
  programId = "222222222222222222222222",
  departmentId = "333333333333333333333333";
function query<T>(value: T) {
  return { lean: async () => value };
}
const row = alumniImportRowSchema.parse({
  studentNumber: "SYN-1",
  firstName: "Imported",
  lastName: "Name",
  gender: "Female",
  departmentName: "IT",
  programCode: "BSIT",
  graduationYear: 2024,
  isTracked: true,
});
function fixture(existing: object | null = null) {
  const changes: Array<Record<string, unknown>> = [],
    events: Array<unknown> = [],
    audits: Array<unknown> = [];
  let transactions = 0;
  const db = {
    Department: { find: () => ({ limit: () => query([{ _id: departmentId, name: "IT" }]) }) },
    Program: {
      findOne: () =>
        query<{ _id: string; code: string; departmentId: string } | null>({
          _id: programId,
          code: "BSIT",
          departmentId,
        }),
    },
    User: {
      findOne: () => query(null as object | null),
      findById: (id: string) => ({
        select: () =>
          query({ _id: id, name: "Import Administrator", email: "import-admin@example.test" }),
      }),
    },
    Alumni: {
      findOne: () => query(existing),
      findOneAndUpdate: (_q: unknown, update: { $set: Record<string, unknown> }) => {
        changes.push(update.$set);
        return query({ _id: alumniId, ...existing, ...update.$set });
      },
      create: async (data: Record<string, unknown>) => {
        changes.push(data);
        return { _id: alumniId, ...data };
      },
    },
    TrackingEvent: {
      create: async (data: unknown) => {
        events.push(data);
      },
    },
    AuditLog: {
      create: async (data: unknown) => {
        audits.push(data);
      },
    },
    transaction: async <T>(work: (tx: Database) => Promise<T>) => {
      transactions++;
      return work(db as unknown as Database);
    },
  };
  return {
    db: db as unknown as Database,
    raw: db,
    changes,
    events,
    audits,
    transactions: () => transactions,
  };
}
it("batch importer uses an independent transaction for each valid row and reports invalid rows", async () => {
  const f = fixture();
  const result = await importAlumniRows(f.db, [row, { ...row, gender: "invalid" }]);
  assert.equal(result.successCount, 1);
  assert.equal(result.errorCount, 1);
  assert.equal(result.errors[0]?.row, 2);
  assert.equal(f.transactions(), 1);
  assert.equal(f.events.length, 1);
  assert.equal(f.audits.length, 1);
});

it("stores normalized imported international numbers and preserves significant Italian zeros", async () => {
  for (const [mobileNumber, expected] of [
    ["+63 (0)917 123-4567", "+639171234567"],
    ["+44 (0)20 7946 0192", "+442079460192"],
    ["+39 02 1234 5678", "+390212345678"],
  ] as const) {
    const f = fixture();
    await upsertImportedAlumni(f.db, { ...row, mobileNumber }, false);
    assert.equal(f.changes[0]?.mobileNumber, expected);
  }
});
it("rejects missing or invalid graduation years before import transactions or writes", async () => {
  const f = fixture();
  const { graduationYear: _year, ...withoutYear } = row;
  const invalidRows = [
    withoutYear,
    ...["", " ", null, 2024.5, 1949, 2101].map((graduationYear) => ({ ...row, graduationYear })),
  ];
  const result = await importAlumniRows(f.db, invalidRows);
  assert.equal(result.successCount, 0);
  assert.equal(result.errorCount, invalidRows.length);
  assert.equal(f.transactions(), 0);
  assert.deepEqual(f.changes, []);
  assert.deepEqual(f.events, []);
  assert.deepEqual(f.audits, []);
});
it("archived imported alumni cannot be resurrected by batch or webhook paths", async () => {
  const f = fixture({ _id: alumniId, deletedAt: new Date() });
  await assert.rejects(() => upsertImportedAlumni(f.db, row, true), ImportRowError);
  assert.equal(f.changes.length, 0);
});
it("linked user names remain the source of truth during imports", async () => {
  const f = fixture({
    _id: alumniId,
    firstName: "Old",
    lastName: "Profile",
    studentNumber: "SYN-1",
    isTracked: false,
  });
  f.raw.User.findOne = () =>
    query({
      _id: "444444444444444444444444",
      firstName: "Reviewed",
      middleName: "Account",
      lastName: "Owner",
      suffix: "Jr.",
      gender: "Male",
      phoneNumber: "+639171234567",
      email: "owner@example.test",
      facebookAccount: "https://facebook.com/account.owner",
    });
  await upsertImportedAlumni(f.db, row, true);
  assert.equal(f.changes[0]?.firstName, "Reviewed");
  assert.equal(f.changes[0]?.lastName, "Owner");
  assert.equal(f.changes[0]?.suffix, "Jr.");
  assert.equal(f.changes[0]?.gender, "Male");
  assert.equal(f.changes[0]?.mobileNumber, "+639171234567");
  assert.equal(f.changes[0]?.personalEmail, "owner@example.test");
  assert.equal(f.changes[0]?.facebookAccount, "https://facebook.com/account.owner");
  assert.equal(f.events.length, 1);
});
it("invalid import names, contact data and graduation ranges fail before database writes", async () => {
  for (const data of [
    { ...row, firstName: "Control\u0000" },
    { ...row, firstName: "A".repeat(81) },
    { ...row, mobileNumber: "not-phone" },
    { ...row, graduationYear: 0 },
  ])
    await assert.rejects(() => upsertImportedAlumni({} as Database, data, true), ImportRowError);
});
it("unknown or archived referenced academic records reject imports without writing alumni", async () => {
  const f = fixture();
  f.raw.Program.findOne = () => query(null);
  await assert.rejects(() => upsertImportedAlumni(f.db, row, true), /Unknown program/);
  assert.equal(f.changes.length, 0);
});

it("imports preserve optional suffixes and record the authorized tracking actor", async () => {
  const f = fixture();
  const actorId = "555555555555555555555555";
  const result = await importAlumniRows(f.db, [{ ...row, suffix: "de la Casa" }], { actorId });
  assert.equal(result.successCount, 1);
  assert.equal(f.changes[0]?.suffix, "de la Casa");
  assert.equal((f.events[0] as { createdById: string }).createdById, actorId);
  assert.equal((f.audits[0] as { actorId: string }).actorId, actorId);
  assert.equal(
    (f.audits[0] as { metadata: { actorSnapshot: { email: string } } }).metadata.actorSnapshot
      .email,
    "import-admin@example.test",
  );
  const existing = fixture({ _id: alumniId, suffix: "Jr.", isTracked: true });
  await upsertImportedAlumni(existing.db, row, true);
  assert.equal(existing.changes[0]?.suffix, "Jr.");
});

it("an import without a tracking decision preserves existing tracking and rejects unknown flags", async () => {
  const timestamp = new Date("2025-01-01T00:00:00Z");
  const f = fixture({ _id: alumniId, isTracked: true, lastTrackedAt: timestamp });
  const { isTracked: _oldFlag, ...withoutFlag } = row;
  const result = await importAlumniRows(f.db, [withoutFlag]);
  assert.equal(result.successCount, 1);
  assert.equal(f.changes[0]?.isTracked, true);
  assert.equal(f.changes[0]?.lastTrackedAt, timestamp);
  assert.equal(f.events.length, 0);
  assert.equal((await importAlumniRows(f.db, [{ ...row, isTracked: "maybe" }])).errorCount, 1);
});

it("rejects ambiguous department names before writing alumni", async () => {
  const f = fixture();
  f.raw.Department.find = () => ({
    limit: () =>
      query([
        { _id: departmentId, name: "IT" },
        { _id: programId, name: "IT" },
      ]),
  });
  await assert.rejects(() => upsertImportedAlumni(f.db, row, true), /Ambiguous department name/);
  assert.equal(f.changes.length, 0);
});
