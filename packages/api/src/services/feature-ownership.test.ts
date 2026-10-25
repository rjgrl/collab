import assert from "node:assert/strict";
import { it } from "node:test";
import { modelFixture } from "./model-test-fixture";
import type { Context } from "../context";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { PERMISSION_KEYS } from "@Alumni-Tracking-Ss/db";
import {
  alumniService,
  meProfileService,
  linkAlumni,
  assertEvidenceReadAccess,
  filesService,
} from "../../../../apps/server/src/modules/alumni/service";
import {
  departmentsService,
  programsService,
} from "../../../../apps/server/src/modules/academic/service";
import {
  alumniInputSchema,
  alumniOutputSchema,
  meProfileUpdateSchema,
  employmentInputSchema,
} from "@Alumni-Tracking-Ss/contracts/alumni";
const userId = "111111111111111111111111",
  alumniId = "222222222222222222222222",
  otherId = "333333333333333333333333",
  programId = "444444444444444444444444",
  departmentId = "555555555555555555555555";
function query<T>(value: T) {
  return Object.assign(Promise.resolve(value), {
    select() {
      return this;
    },
    sort() {
      return this;
    },
    skip() {
      return this;
    },
    limit() {
      return this;
    },
    lean() {
      return this;
    },
    exec: async () => value,
  });
}
function context(db: object, roles = ["viewer"]): Context {
  return {
    db: db as Database,
    sessionToken: "synthetic",
    user: {
      id: userId,
      name: "Synthetic Account",
      email: "synthetic@example.test",
      image: null,
      status: "active",
      roles,
      permissions: [...PERMISSION_KEYS],
      mfaVerified: true,
    },
    ipAddress: null,
    userAgent: null,
    integrationEnv: {},
  };
}
const alumni = {
  _id: alumniId,
  studentNumber: "SYN-1",
  firstName: "Original",
  lastName: "Profile",
  programId,
  isTracked: false,
};
const program = { _id: programId, code: "BSIT", name: "IT program", departmentId };
const department = { _id: departmentId, name: "IT department" };
function linkedDb() {
  return {
    User: {
      findOne: () =>
        query({
          _id: userId,
          status: "active",
          alumniId,
          firstName: "User",
          lastName: "Names",
          middleName: "Middle",
          suffix: "Jr.",
        }),
    },
    Alumni: { findOne: () => query(alumni) },
    Program: { findById: () => query(program) },
    Department: { findById: () => query(department) },
    Employment: { find: () => query([]) },
    TrackingEvent: { find: () => query([]) },
    EvidenceFile: { find: () => query([]) },
  };
}
it("blocks Alumni directory and management APIs even with every permission", async () => {
  for (const roles of [["viewer"], ["alumni"]]) {
    const c = context({}, roles);
    for (const operation of [
      () => alumniService.list(c),
      () => alumniService.get(c, { id: alumniId }),
      () => departmentsService.list(c),
      () => programsService.list(c),
      () => filesService.remove(c, { id: otherId }),
    ])
      await assert.rejects(operation, /only access My Profile/);
  }
});
it("unlinked profile requires explicit administrator linking without email/name lookup", async () => {
  let filter: unknown;
  const c = context({
    User: {
      findOne: (q: unknown) => {
        filter = q;
        return query({ _id: userId, alumniId: null });
      },
    },
  });
  await assert.rejects(() => meProfileService.get(c), /linked.*administrator/);
  assert.deepEqual(filter, { _id: userId, status: "active" });
});
it("own profile is selected from the database User.alumniId rather than request/session hints", async () => {
  const db = linkedDb();
  let filter: unknown;
  db.Alumni.findOne = (q?: unknown) => {
    filter = q;
    return query(alumni);
  };
  const c = context(db);
  const result = await meProfileService.get(c);
  assert.equal(result.id, alumniId);
  assert.deepEqual(filter, { _id: alumniId, deletedAt: null });
  assert.deepEqual(result.evidenceFiles, []);
});
it("private evidence needs both files.read and trusted linked ownership", async () => {
  const c = context(linkedDb());
  await assertEvidenceReadAccess(c, { alumniId });
  await assert.rejects(
    () => assertEvidenceReadAccess(c, { alumniId: otherId }),
    /own linked profile/,
  );
  c.user!.permissions = [];
  await assert.rejects(() => assertEvidenceReadAccess(c, { alumniId }), /files.read/);
});
it("retired profile PATCH rejects personal fields and directs direct service calls to Settings", async () => {
  for (const change of [
    {},
    { firstName: "Changed", lastName: "Name" },
    { mobileNumber: "+639171234567" },
    { gender: "Female" },
    { facebookAccount: "https://facebook.com/example" },
    { studentNumber: "hostile" },
    { personalEmail: "other@example.test" },
  ])
    assert.equal(meProfileUpdateSchema.safeParse(change).success, false);
  const f = modelFixture();
  await assert.rejects(() => meProfileService.update(context(f.db), {}), /Settings.*Account/);
  assert.equal(f.operations.length, 0);
});
it("retired manual Alumni create/link APIs deny every management role and preserve existing ownership", async () => {
  for (const roles of [["staff"], ["admin"], ["super_admin"], ["legacy_manager"]]) {
    const f = modelFixture({
      User: [{ id: userId, alumniId, firstName: "Existing", lastName: "Owner" }],
      Alumni: [{ ...alumni, id: alumniId }],
    });
    const before = structuredClone(f.tables);
    const c = context(f.db, roles);
    await assert.rejects(
      () => linkAlumni(c, { id: userId, alumniId: otherId }),
      /Manual Alumni linking/,
    );
    await assert.rejects(
      () =>
        alumniService.create(c, {
          studentNumber: "NEW",
          graduationYear: 2024,
          firstName: "New",
          lastName: "Record",
          gender: "Female",
          programId,
        }),
      /must self-register/,
    );
    assert.equal(f.operations.length, 0);
    assert.deepEqual(f.tables, before);
  }
});
it("retired linking still requires both permissions and completed security gates", async () => {
  const admin = context({}, ["super_admin"]);
  admin.user!.permissions = ["users.write"];
  await assert.rejects(() => linkAlumni(admin, { id: userId, alumniId }), /alumni.write/);
  admin.user!.permissions = [...PERMISSION_KEYS];
  admin.user!.needsProfileCompletion = true;
  await assert.rejects(() => linkAlumni(admin, { id: userId, alumniId }), /verification/);
  admin.user!.needsProfileCompletion = false;
  admin.user!.mfaVerified = false;
  await assert.rejects(() => linkAlumni(admin, { id: userId, alumniId }), /authenticator/);
});
it("Alumni management only updates academic fields and rejects identity/contact writes", async () => {
  const f = modelFixture({
    User: [{ id: userId, status: "disabled", alumniId, firstName: "Account", lastName: "Name" }],
    Alumni: [{ ...alumni, id: alumniId }],
    Program: [{ ...program, id: programId }],
    Department: [{ ...department, id: departmentId }],
  });
  const academic = { id: alumniId, studentNumber: "SYN-2", programId, graduationYear: 2025 };
  for (const key of ["firstName", "gender", "personalEmail", "mobileNumber", "facebookAccount"])
    await assert.rejects(() =>
      alumniService.update(context(f.db, ["staff"]), {
        ...academic,
        [key]: "Changed",
      }),
    );
  assert.equal(f.operations.length, 0);
  await alumniService.update(context(f.db, ["staff"]), academic);
  assert.equal(f.tables.Alumni?.[0]?.studentNumber, "SYN-2");
  assert.equal(f.tables.Alumni?.[0]?.firstName, "Original");
});
it("malformed IDs and employment date order fail before persistence", async () => {
  const c = context({}, ["staff"]);
  await assert.rejects(() => alumniService.get(c, { id: "bad" }));
  await assert.rejects(() => programsService.get(c, { id: "$ne" }));
  assert.equal(
    employmentInputSchema.safeParse({
      alumniId,
      employer: "Synthetic",
      startDate: "2026-10-22T00:00:00Z",
      endDate: "2026-10-21T00:00:00Z",
    }).success,
    false,
  );
  assert.equal(
    alumniInputSchema.safeParse({
      studentNumber: "1",
      firstName: "A",
      lastName: "B",
      gender: "Female",
      programId: { $ne: null },
    }).success,
    false,
  );
});
it("explicit alumni DTO strips future private fields and retains typed UI fields", () => {
  const value = alumniOutputSchema.parse({
    ...alumni,
    id: alumniId,
    program: { ...program, id: programId, department: { ...department, id: departmentId } },
    passwordHash: "private",
    createdAt: "2026-10-22T00:00:00Z",
    mobileNumber: "+639171234567",
  });
  assert.equal("passwordHash" in value, false);
  assert.equal("_id" in value, false);
  assert.ok(value.createdAt instanceof Date);
  assert.equal(value.mobileNumber, "+639171234567");
});
