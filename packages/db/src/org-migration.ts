import { Types, type ClientSession } from "mongoose";
import { contactInputSchema, type ContactType } from "@Alumni-Tracking-Ss/contracts/contacts";
import type { Database } from "./index";
import type { MigrationMode } from "./migration";

type NativeDatabase = NonNullable<Database["connection"]["db"]>;
type Id = Types.ObjectId;

export const ORG_MIGRATION_ID = "org-structure-v1";
const STATE = "MigrationState";
export const PLACEHOLDER_SUFFIX = " – Unsorted";

/**
 * Durable record of the College → Department → Program restructure. It is the only
 * input rollback trusts, so it lists every placeholder and every document the step changed.
 */
// shortcut: id lists live in one document (16 MB, roughly 500k ids); split per batch if alumni ever exceed that.
interface OrgState {
  _id: string;
  state: "renaming" | "renamed" | "complete" | "rolling-back";
  fresh?: boolean;
  departments: { collegeId: Id; departmentId: Id }[];
  faculty: Id[];
  contacts: Id[];
  updatedAt: Date;
}

export interface OrgMigrationReport {
  state: "fresh" | "pending" | "complete" | "rolled-back" | "conflict";
  colleges: number;
  programs: number;
  orphanPrograms: number;
  facultyLinked: number;
  facultyNeedsReview: number;
  contactsImported: number;
  contactsSkipped: number;
  reason?: string;
}

const empty = (state: OrgMigrationReport["state"], reason?: string): OrgMigrationReport => ({
  state,
  colleges: 0,
  programs: 0,
  orphanPrograms: 0,
  facultyLinked: 0,
  facultyNeedsReview: 0,
  contactsImported: 0,
  contactsSkipped: 0,
  ...(reason ? { reason } : {}),
});

async function collectionNames(native: NativeDatabase) {
  return (await native.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name);
}

type Plan = Awaited<ReturnType<typeof planOrgData>>;

/** Reads only. `collegeCollection` is "Department" before the rename and "College" after it. */
async function planOrgData(
  native: NativeDatabase,
  collegeCollection: string,
  session?: ClientSession,
) {
  const now = new Date();
  const colleges = await native
    .collection<{ _id: Id; name: string; deletedAt?: Date | null }>(collegeCollection)
    .find({}, { session, projection: { name: 1, deletedAt: 1 } })
    .toArray();
  const departments = colleges.map((college) => ({
    _id: new Types.ObjectId(),
    collegeId: college._id,
    name: `${college.name}${PLACEHOLDER_SUFFIX}`,
    description:
      "Created by the College/Department restructure. Move these programs to their real departments, then archive this placeholder.",
    deletedAt: college.deletedAt ?? null,
    createdAt: now,
    updatedAt: now,
  }));
  const byCollege = new Map(departments.map((d) => [String(d.collegeId), d._id]));
  const programs = native.collection("Program");
  const programCount = await programs.countDocuments({}, { session });
  const orphanPrograms = await programs.countDocuments(
    { departmentId: { $nin: colleges.map((c) => c._id) } },
    { session },
  );

  const facultyUpdates: { _id: Id; set: Record<string, unknown> }[] = [];
  const claimedUsers = new Set<string>();
  const legacyFaculty = await native
    .collection<{ _id: Id; email?: string | null }>("Faculty")
    .find({ roleLevel: { $exists: false } }, { session, projection: { email: 1 } })
    .toArray();
  for (const faculty of legacyFaculty) {
    const links = await native
      .collection<{ departmentId: Id }>("FacultyDepartment")
      .find({ facultyId: faculty._id }, { session })
      .toArray();
    const placed = [
      ...new Set(links.map((l) => byCollege.get(String(l.departmentId))).filter(Boolean)),
    ];
    const email = faculty.email?.trim().toLowerCase();
    const user = email
      ? await native.collection("User").findOne({ email }, { session, projection: { _id: 1 } })
      : null;
    const userId = user && !claimedUsers.has(String(user._id)) ? (user._id as Id) : null;
    if (userId) claimedUsers.add(String(userId));
    const departmentId = placed.length === 1 ? placed[0]! : null;
    facultyUpdates.push({
      _id: faculty._id,
      set: { userId, departmentId, roleLevel: "faculty", active: Boolean(userId && departmentId) },
    });
  }

  const contacts: Record<string, unknown>[] = [];
  let contactsSkipped = 0;
  const legacyFields: [string, ContactType][] = [
    ["mobileNumber", "phone"],
    ["personalEmail", "email"],
    ["facebookAccount", "facebook"],
  ];
  const cursor = native
    .collection<Record<string, unknown> & { _id: Id }>("Alumni")
    .find(
      { $or: legacyFields.map(([field]) => ({ [field]: { $nin: [null, ""] } })) },
      { session, projection: { mobileNumber: 1, personalEmail: 1, facebookAccount: 1 } },
    );
  for await (const alumni of cursor) {
    for (const [field, type] of legacyFields) {
      const raw = alumni[field];
      if (typeof raw !== "string" || !raw.trim()) continue;
      const parsed = contactInputSchema.safeParse({ type, value: raw });
      if (!parsed.success) {
        contactsSkipped++;
        continue;
      }
      contacts.push({
        _id: new Types.ObjectId(),
        alumniId: alumni._id,
        type,
        value: parsed.data.value,
        label: "",
        isPrimary: true,
        createdById: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return {
    departments,
    programCount,
    orphanPrograms,
    facultyUpdates,
    contacts,
    contactsSkipped,
  };
}

function summarize(state: OrgMigrationReport["state"], plan: Plan): OrgMigrationReport {
  return {
    state,
    colleges: plan.departments.length,
    programs: plan.programCount,
    orphanPrograms: plan.orphanPrograms,
    facultyLinked: plan.facultyUpdates.filter((f) => f.set.active).length,
    facultyNeedsReview: plan.facultyUpdates.filter((f) => !f.set.active).length,
    contactsImported: plan.contacts.length,
    contactsSkipped: plan.contactsSkipped,
  };
}

async function inTransaction<T>(db: Database, work: (session: ClientSession) => Promise<T>) {
  const session = await db.connection.startSession();
  try {
    return await session.withTransaction(work);
  } finally {
    await session.endSession();
  }
}

/**
 * Step 1 (apply only): rename the legacy top-level `Department` collection to `College`.
 * Must run before the generic collection/index creation so `Department` can be recreated.
 */
export async function renameLegacyDepartments(native: NativeDatabase) {
  const names = await collectionNames(native);
  const states = native.collection<OrgState>(STATE);
  const existing = names.includes(STATE) ? await states.findOne({ _id: ORG_MIGRATION_ID }) : null;
  if (existing && existing.state !== "renaming") return;
  if (!existing && !names.includes("Department")) {
    await states.insertOne({
      _id: ORG_MIGRATION_ID,
      state: "complete",
      fresh: true,
      departments: [],
      faculty: [],
      contacts: [],
      updatedAt: new Date(),
    });
    return;
  }
  if (!existing)
    await states.insertOne({
      _id: ORG_MIGRATION_ID,
      state: "renaming",
      departments: [],
      faculty: [],
      contacts: [],
      updatedAt: new Date(),
    });
  if (names.includes("Department") && !names.includes("College"))
    await native.renameCollection("Department", "College");
  await states.updateOne(
    { _id: ORG_MIGRATION_ID },
    { $set: { state: "renamed", updatedAt: new Date() } },
  );
}

/** Inspect (dry-run), finish (apply, after indexes exist), or undo (rollback) the restructure. */
export async function migrateOrgStructure(
  db: Database,
  native: NativeDatabase,
  mode: MigrationMode,
): Promise<OrgMigrationReport> {
  const names = await collectionNames(native);
  const states = native.collection<OrgState>(STATE);
  const marker = names.includes(STATE) ? await states.findOne({ _id: ORG_MIGRATION_ID }) : null;

  if (mode === "rollback") return rollbackOrgStructure(db, native, marker);

  if (!marker) {
    if (!names.includes("Department")) return empty("fresh");
    if (names.includes("College"))
      return empty(
        "conflict",
        "College and Department both exist without a restructure record; nothing changed.",
      );
    return summarize("pending", await planOrgData(native, "Department"));
  }
  if (marker.state === "complete") return empty(marker.fresh ? "fresh" : "complete");
  if (marker.state === "rolling-back")
    return empty("conflict", "A rollback was interrupted; run --rollback again to finish it.");
  if (marker.state === "renaming")
    return summarize(
      "pending",
      await planOrgData(native, names.includes("College") ? "College" : "Department"),
    );
  if (mode === "dry-run") return summarize("pending", await planOrgData(native, "College"));

  const plan = await inTransaction(db, async (session) => {
    const current = await states.findOne({ _id: ORG_MIGRATION_ID }, { session });
    if (current?.state !== "renamed") return null;
    const planned = await planOrgData(native, "College", session);
    if (planned.departments.length)
      await native.collection("Department").insertMany(planned.departments, { session });
    for (const { _id, collegeId } of planned.departments)
      await native
        .collection("Program")
        .updateMany({ departmentId: collegeId }, { $set: { departmentId: _id } }, { session });
    for (const { _id, set } of planned.facultyUpdates)
      await native.collection("Faculty").updateOne({ _id }, { $set: set }, { session });
    for (let i = 0; i < planned.contacts.length; i += 1000)
      await native
        .collection("AlumniContact")
        .insertMany(planned.contacts.slice(i, i + 1000), { session });
    await states.updateOne(
      { _id: ORG_MIGRATION_ID },
      {
        $set: {
          state: "complete",
          departments: planned.departments.map(({ _id, collegeId }) => ({
            collegeId,
            departmentId: _id,
          })),
          faculty: planned.facultyUpdates.map(({ _id }) => _id),
          contacts: planned.contacts.map(({ _id }) => _id as Id),
          updatedAt: new Date(),
        },
      },
      { session },
    );
    return planned;
  });
  return plan ? summarize("complete", plan) : empty("complete");
}

async function rollbackOrgStructure(
  db: Database,
  native: NativeDatabase,
  marker: OrgState | null,
): Promise<OrgMigrationReport> {
  const states = native.collection<OrgState>(STATE);
  if (!marker) return empty("rolled-back");
  if (marker.fresh) {
    await states.deleteOne({ _id: ORG_MIGRATION_ID });
    return empty("fresh", "Fresh install: there was no legacy structure to restore.");
  }
  if (marker.state === "complete") {
    const placeholders = marker.departments.map((d) => d.departmentId);
    const extraDepartments = await native
      .collection("Department")
      .countDocuments({ _id: { $nin: placeholders } });
    if (extraDepartments)
      return empty(
        "conflict",
        `${extraDepartments} department(s) were created after the restructure. Move their programs back to the placeholders and remove them before rollback; nothing changed.`,
      );
    const extraFaculty = await native
      .collection("Faculty")
      .countDocuments({ _id: { $nin: marker.faculty }, departmentId: { $type: "objectId" } });
    if (extraFaculty)
      return empty(
        "conflict",
        `${extraFaculty} faculty record(s) were placed in new departments after the restructure; nothing changed.`,
      );
    await inTransaction(db, async (session) => {
      for (const { collegeId, departmentId } of marker.departments)
        await native
          .collection("Program")
          .updateMany({ departmentId }, { $set: { departmentId: collegeId } }, { session });
      if (marker.faculty.length)
        await native
          .collection("Faculty")
          .updateMany(
            { _id: { $in: marker.faculty } },
            { $unset: { userId: "", departmentId: "", roleLevel: "", active: "" } },
            { session },
          );
      if (marker.contacts.length)
        await native
          .collection("AlumniContact")
          .deleteMany({ _id: { $in: marker.contacts } }, { session });
      await native.collection("Department").deleteMany({}, { session });
      await states.updateOne(
        { _id: ORG_MIGRATION_ID },
        { $set: { state: "rolling-back", updatedAt: new Date() } },
        { session },
      );
    });
  } else if (
    marker.state !== "rolling-back" &&
    marker.state !== "renamed" &&
    marker.state !== "renaming"
  ) {
    return empty("conflict", "Unknown restructure state; nothing changed.");
  }
  // Collection DDL cannot run inside a transaction; each step below is safe to repeat.
  const current = await collectionNames(native);
  if (current.includes("College")) {
    if (current.includes("Department")) {
      if (await native.collection("Department").countDocuments())
        return empty(
          "conflict",
          "Department still holds documents; rollback stopped before dropping it.",
        );
      await native.collection("Department").drop();
    }
    await native.renameCollection("College", "Department");
  }
  await states.deleteOne({ _id: ORG_MIGRATION_ID });
  return empty("rolled-back");
}
