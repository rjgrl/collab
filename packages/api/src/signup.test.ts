import assert from "node:assert/strict";
import { it } from "node:test";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { registerUser, upsertGoogleUser } from "./services/session";

const input = {
  name: "Test Member",
  email: " NEW@Example.test ",
  password: "SyntheticPassword123!",
  phoneNumber: "+639171234567",
  gender: "Female" as const,
  facebookAccount: "https://facebook.com/test.member",
};
function fixture(existing: Record<string, unknown> | null = null, collide = false) {
  let record = existing;
  const writes: Record<string, unknown>[] = [];
  const lookups: string[] = [];
  let audits = 0;
  const db = {
    user: {
      findUnique: async ({ where }: { where: { email: string } }) => {
        lookups.push(where.email);
        return record;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push(data);
        if (collide) {
          record = { id: "winner", email: "new@example.test", status: "active" };
          throw { code: "P2002" };
        }
        record = { ...data, id: "new-user" };
        return record;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        record = { ...record, ...data };
        return record;
      },
    },
    role: { findUnique: async () => ({ id: "viewer", key: "viewer" }) },
    auditLog: {
      create: async () => {
        audits++;
      },
    },
  } as unknown as Database;
  return { db, writes, lookups, audits: () => audits };
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
  assert.deepEqual(f.writes[0]?.userRoles, { create: { roleId: "viewer" } });
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
  assert.equal("passwordHash" in f.writes[0]!, false);
  assert.deepEqual(f.writes[0]?.userRoles, { create: { roleId: "viewer" } });
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
