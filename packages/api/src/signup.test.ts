import assert from "node:assert/strict";
import { it } from "node:test";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { modelFixture } from "./test-utils/model-test-fixture";
import { signupSchema } from "@Alumni-Tracking-Ss/contracts/auth";
import { registerUser, upsertGoogleUser } from "./services/session";

const input = {
  firstName: "Test",
  middleName: "",
  lastName: "Member",
  suffix: "",
  email: " NEW@Example.test ",
  password: "SyntheticPassword123!",
  phoneNumber: "+639171234567",
  gender: "Female" as const,
  facebookAccount: "https://facebook.com/test.member",
  studentNumber: "SYN-001",
  programId: "111111111111111111111111",
  graduationYear: 2024,
};
function fixture(existing: Record<string, unknown> | null = null, collide = false) {
  const f = modelFixture({
    User: existing ? [{ email: "new@example.test", ...existing }] : [],
    Role: [{ id: "alumni", _id: "alumni", key: "alumni" }],
    Program: [
      { id: input.programId, _id: input.programId, departmentId: "222222222222222222222222" },
    ],
    Department: [{ id: "222222222222222222222222", _id: "222222222222222222222222" }],
  });
  const db = new Proxy(f.db, {
    get(target, key) {
      if (key === "User" && collide)
        return {
          ...target.User,
          create: async (data: Record<string, unknown>) => {
            f.operations.push({ model: "User", method: "create", update: data });
            throw { code: 11000 };
          },
        };
      if (key === "transaction")
        return async <T>(work: (tx: Database) => Promise<T>) => {
          try {
            return await target.transaction(() => work(db));
          } catch (error) {
            if (collide)
              f.tables.User = [{ id: "winner", email: "new@example.test", status: "active" }];
            throw error;
          }
        };
      return Reflect.get(target, key);
    },
  });
  return {
    db,
    tables: f.tables,
    get writes() {
      return f.operations
        .filter((op) => op.model === "User" && op.method === "create")
        .map((op) => op.update!);
    },
    get lookups() {
      return f.operations
        .filter((op) => op.model === "User" && op.method === "findOne")
        .map((op) => op.filter?.email);
    },
    audits: () =>
      f.operations.filter((op) => op.model === "AuditLog" && op.method === "create").length,
  };
}

it("stores signup contact fields with a normalized unique email and hashed password", async () => {
  const f = fixture();
  await registerUser(f.db, input);
  assert.deepEqual(f.lookups, ["new@example.test"]);
  assert.equal(f.writes[0]?.phoneNumber, input.phoneNumber);
  assert.equal(f.writes[0]?.gender, "Female");
  assert.equal(f.writes[0]?.facebookAccount, input.facebookAccount);
  assert.equal(f.writes[0]?.email, "new@example.test");
  assert.notEqual(f.writes[0]?.passwordHash, input.password);
  assert.equal(f.tables.UserRole?.[0]?.roleId, "alumni");
  assert.equal(f.tables.User?.[0]?.alumniId, f.tables.Alumni?.[0]?.id);
  assert.equal(f.tables.Alumni?.[0]?.studentNumber, "SYN-001");
  assert.equal(f.tables.Alumni?.[0]?.graduationYear, 2024);
});
it("rejects missing or invalid graduation years before signup persistence", async () => {
  const { graduationYear: _year, ...withoutYear } = input;
  for (const data of [
    withoutYear,
    ...["", null, 2024.5, 1949, 2101].map((graduationYear) => ({ ...input, graduationYear })),
  ]) {
    const f = fixture();
    await assert.rejects(() => registerUser(f.db, data as typeof input));
    assert.deepEqual(f.lookups, []);
    assert.deepEqual(f.writes, []);
    assert.equal(f.tables.Alumni?.length ?? 0, 0);
    assert.equal(f.audits(), 0);
  }
});
it("rejects non-BukSU emails at signup before anything is stored", async () => {
  const previous = process.env.STAFF_EMAIL_DOMAINS;
  process.env.STAFF_EMAIL_DOMAINS = "buksu.edu.ph,student.buksu.edu.ph";
  try {
    for (const email of ["grad@gmail.com", "grad@buksu.edu.ph.evil.com", "grad@xbuksu.edu.ph"]) {
      const f = fixture();
      await assert.rejects(() => registerUser(f.db, { ...input, email }), /BukSU institutional/);
      assert.deepEqual(f.lookups, []);
      assert.deepEqual(f.writes, []);
      assert.equal(f.tables.Alumni?.length ?? 0, 0);
    }
    const ok = fixture();
    await registerUser(ok.db, { ...input, email: "grad@student.buksu.edu.ph" });
    assert.equal(ok.writes[0]?.email, "grad@student.buksu.edu.ph");
  } finally {
    if (previous === undefined) delete process.env.STAFF_EMAIL_DOMAINS;
    else process.env.STAFF_EMAIL_DOMAINS = previous;
  }
});
it("rejects existing emails before creating an account", async () => {
  const f = fixture({ id: "existing" });
  await assert.rejects(() => registerUser(f.db, input), /already exists/);
  assert.equal(f.writes.length, 0);
  assert.equal(f.audits(), 0);
});
it("reports a conflict when another signup wins the unique-email race", async () => {
  const f = fixture(null, true);
  await assert.rejects(
    () => registerUser(f.db, input),
    (error: unknown) =>
      typeof error === "object" && error !== null && "code" in error && error.code === "CONFLICT",
  );
  assert.equal(f.audits(), 0);
});
it("reuses a Google account matching an existing email without replacing its password", async () => {
  const f = fixture({
    id: "existing",
    email: "new@example.test",
    status: "active",
    passwordHash: "existing-hash",
  });
  const user = await upsertGoogleUser(f.db, { email: input.email, name: "Google name" });
  assert.equal(user.id, "existing");
  assert.equal(user.passwordHash, "existing-hash");
  assert.equal(f.writes.length, 0);
});
it("new Google accounts are passwordless, use Viewer, and require profile completion", async () => {
  const f = fixture();
  await upsertGoogleUser(f.db, { email: input.email, name: "Google name" });
  assert.equal(f.writes[0]?.needsProfileCompletion, true);
  assert.equal(f.writes[0]?.emailVerified, true);
  assert.equal(f.writes[0]?.passwordHash, null);
  assert.equal(f.tables.UserRole?.[0]?.roleId, "alumni");
});
it("simultaneous Google signups reuse the winning account", async () => {
  const f = fixture(null, true);
  const user = await upsertGoogleUser(f.db, { email: input.email, name: "Google name" });
  assert.equal(user.id, "winner");
});
it("Google sign-in rejects disabled existing accounts", async () => {
  const f = fixture({ id: "disabled", status: "disabled" });
  await assert.rejects(
    () => upsertGoogleUser(f.db, { email: input.email, name: "Google name" }),
    /disabled/,
  );
  assert.equal(f.writes.length, 0);
});

it("lets a verified Google identity take over an unconfirmed password registration", async () => {
  // Someone else may have registered this email; Google proves who owns it. The pending
  // account (with its unknown password and sessions) is released, never linked.
  const f = fixture({
    _id: "pending",
    id: "pending",
    status: "active",
    verificationRequired: true,
    emailVerified: false,
    passwordHash: "existing-unconfirmed-hash",
    createdAt: new Date(),
  });
  f.tables.UserRole = [{ userId: "pending", roleId: "alumni" }];
  f.tables.Session = [{ userId: "pending", token: "sha256:squatter" }];
  const user = await upsertGoogleUser(f.db, { email: input.email, name: "Google name" });
  assert.notEqual(user.id, "pending");
  assert.equal(user.emailVerified, true);
  assert.equal(user.passwordHash ?? null, null);
  assert.equal(
    f.tables.User!.some((row) => row.id === "pending"),
    false,
  );
  assert.equal(f.tables.Session!.length, 0);
  assert.equal(f.tables.AuditLog?.[0]?.action, "auth.signup.released");
});

it("never releases a confirmed or staff account for Google or a new sign-up", async () => {
  for (const existing of [
    { emailVerified: true, verificationRequired: true, passwordHash: "hash" },
    { emailVerified: false, verificationRequired: false, passwordHash: "hash" },
  ]) {
    const f = fixture({
      _id: "kept",
      id: "kept",
      status: "active",
      createdAt: new Date(0),
      ...existing,
    });
    f.tables.UserRole = [{ userId: "kept", roleId: "alumni" }];
    await assert.rejects(() => registerUser(f.db, input), /already exists/);
    assert.ok(f.tables.User!.some((row) => row.id === "kept"));
  }
});

it("rejects editable display names and incomplete structured names at signup", () => {
  assert.equal(signupSchema.safeParse({ ...input, name: "Forged name" }).success, false);
  assert.equal(signupSchema.safeParse({ ...input, firstName: "" }).success, false);
  assert.equal(signupSchema.safeParse({ ...input, lastName: "" }).success, false);
});
it("Google does not overwrite confirmed structured or legacy account names", async () => {
  const f = fixture({
    id: "confirmed",
    name: "Ana Mar?a Dela Cruz Jr.",
    firstName: "Ana",
    middleName: "Mar?a",
    lastName: "Dela Cruz",
    suffix: "Jr.",
    emailVerified: true,
    passwordHash: "existing-hash",
    status: "active",
  });
  const user = await upsertGoogleUser(f.db, { email: input.email, name: "Provider Edited Name" });
  assert.equal(user.name, "Ana Mar?a Dela Cruz Jr.");
  assert.equal(user.firstName, "Ana");
  assert.equal(user.lastName, "Dela Cruz");
  assert.equal(user.suffix, "Jr.");
});

it("frees an email and student number held by a registration unconfirmed for over 24 hours", async () => {
  const day = 24 * 60 * 60 * 1000;
  const squatter = (createdAt: Date, email = "new@example.test") => ({
    _id: "squatter",
    id: "squatter",
    email,
    status: "active",
    verificationRequired: true,
    emailVerified: false,
    passwordHash: "attacker-hash",
    alumniId: "held-profile",
    createdAt,
  });
  const heldProfile = {
    _id: "held-profile",
    id: "held-profile",
    studentNumber: input.studentNumber,
  };

  // Under 24 hours: still protected (the real person may be confirming right now).
  const fresh = fixture(squatter(new Date(Date.now() - day + 60_000)));
  fresh.tables.Alumni = [heldProfile];
  fresh.tables.UserRole = [{ userId: "squatter", roleId: "alumni" }];
  await assert.rejects(() => registerUser(fresh.db, input), /already exists/);

  // Same email after 24 hours: released, and its untouched profile frees the student number.
  const stale = fixture(squatter(new Date(Date.now() - day - 60_000)));
  stale.tables.Alumni = [heldProfile];
  stale.tables.UserRole = [{ userId: "squatter", roleId: "alumni" }];
  const user = await registerUser(stale.db, input);
  assert.equal(user.email, "new@example.test");
  assert.equal(
    stale.tables.User!.some((row) => row.id === "squatter"),
    false,
  );
  assert.equal(
    stale.tables.Alumni!.filter((row) => row.studentNumber === input.studentNumber).length,
    1,
  );
  assert.notEqual(stale.tables.Alumni![0]!.id, "held-profile");

  // Student number only (squatter used another email): released the same way.
  const other = fixture(null);
  other.tables.User = [squatter(new Date(Date.now() - 2 * day), "someone.else@example.test")];
  other.tables.Alumni = [heldProfile];
  other.tables.UserRole = [{ userId: "squatter", roleId: "alumni" }];
  await registerUser(other.db, input);
  assert.equal(
    other.tables.User!.some((row) => row.id === "squatter"),
    false,
  );

  // A profile staff already worked on is kept for an administrator, so the number stays taken.
  const touched = fixture(null);
  touched.tables.User = [squatter(new Date(Date.now() - 2 * day), "someone.else@example.test")];
  touched.tables.Alumni = [heldProfile];
  touched.tables.TrackingEvent = [{ alumniId: "held-profile" }];
  touched.tables.UserRole = [{ userId: "squatter", roleId: "alumni" }];
  await assert.rejects(() => registerUser(touched.db, input), /existing profile/);
  assert.ok(touched.tables.Alumni!.some((row) => row.id === "held-profile"));
});
