import assert from "node:assert/strict";
import { it } from "node:test";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { modelFixture } from "./services/model-test-fixture";
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
};
function fixture(existing: Record<string, unknown> | null = null, collide = false) {
  const f = modelFixture({
    User: existing ? [{ email: "new@example.test", ...existing }] : [],
    Role: [{ id: "viewer", _id: "viewer", key: "viewer" }],
    Program: [{ id: input.programId, _id: input.programId, departmentId: "222222222222222222222222" }],
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
  assert.equal(f.tables.UserRole?.[0]?.roleId, "viewer");
  assert.equal(f.tables.User?.[0]?.alumniId, f.tables.Alumni?.[0]?.id);
  assert.equal(f.tables.Alumni?.[0]?.studentNumber, "SYN-001");
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
  assert.equal(f.tables.UserRole?.[0]?.roleId, "viewer");
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

it("does not link Google to an unconfirmed password registration", async () => {
  const f = fixture({
    id: "pending",
    status: "active",
    verificationRequired: true,
    emailVerified: false,
    passwordHash: "existing-unconfirmed-hash",
  });
  await assert.rejects(
    () => upsertGoogleUser(f.db, { email: input.email, name: "Google name" }),
    /Confirm the pending registration email/,
  );
  assert.equal(f.writes.length, 0);
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
