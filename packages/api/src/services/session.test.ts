import assert from "node:assert/strict";
import { it } from "node:test";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { hashPassword } from "@Alumni-Tracking-Ss/db";
import {
  createSession,
  destroySession,
  loadAuthUserFromToken,
  storedSessionToken,
  authenticateWithPassword,
} from "./session";
it("refunds successful login attempts while failed passwords exhaust the account budget", async () => {
  let count = 0;
  const password = "A private login testing passphrase 7878";
  const user = { id: "u", status: "active", passwordHash: await hashPassword(password) };
  const db = {
    authThrottle: {
      upsert: async () => ({ count: ++count }),
      updateMany: async () => {
        count--;
        return { count: 1 };
      },
    },
    user: { findUnique: async () => user },
    userRole: { count: async () => 1 },
    auditLog: { create: async () => ({ id: "audit" }) },
  } as unknown as Database;
  for (let i = 0; i < 6; i++)
    await authenticateWithPassword(db, { email: "test@example.test", password });
  assert.equal(count, 0);
  for (let i = 0; i < 5; i++)
    await assert.rejects(
      () => authenticateWithPassword(db, { email: "test@example.test", password: "incorrect" }),
      /Invalid email or password/,
    );
  await assert.rejects(
    () => authenticateWithPassword(db, { email: "test@example.test", password: "incorrect" }),
    /Too many attempts/,
  );
});
function fixture() {
  let row: Record<string, unknown> | null = null;
  const db = {
    session: {
      create: async ({ data }: { data: object }) => {
        row = { id: "s", createdAt: new Date(), ...data };
        return row;
      },
      findUnique: async ({ where }: { where: { token: string } }) =>
        row?.token === where.token ? { ...row } : null,
      updateMany: async ({ where, data }: { where: { token?: string }; data: object }) => {
        if (!row || (where.token && row.token !== where.token)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      delete: async () => {
        row = null;
      },
      deleteMany: async () => {
        row = null;
      },
    },
    user: {
      findUnique: async () => ({
        id: "u",
        name: "Test",
        email: "test@example.test",
        image: null,
        status: "active",
        passwordHash: "synthetic",
        userRoles: [],
        mfaCredential: null,
      }),
    },
  } as unknown as Database;
  return {
    db,
    get row() {
      return row;
    },
    setRow: (value: Record<string, unknown>) => {
      row = value;
    },
  };
}
it("stores only session digests and rejects a stolen database digest as a bearer credential", async () => {
  const f = fixture();
  const session = await createSession(f.db, "u", {});
  assert.equal(f.row!.token, storedSessionToken(session.token));
  assert.notEqual(f.row!.token, session.token);
  assert.ok(await loadAuthUserFromToken(f.db, session.token));
  assert.equal(await loadAuthUserFromToken(f.db, String(f.row!.token)), null);
  await destroySession(f.db, session.token);
  assert.equal(await loadAuthUserFromToken(f.db, session.token), null);
});
it("lazily migrates valid legacy sessions and rejects idle/absolute expiration", async () => {
  const f = fixture();
  f.setRow({
    id: "s",
    userId: "u",
    token: "legacy",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  });
  assert.ok(await loadAuthUserFromToken(f.db, "legacy"));
  assert.equal(f.row!.token, storedSessionToken("legacy"));
  f.row!.createdAt = new Date(0);
  assert.equal(await loadAuthUserFromToken(f.db, "legacy"), null);
  f.setRow({
    id: "s",
    userId: "u",
    token: storedSessionToken("expired"),
    createdAt: new Date(),
    expiresAt: new Date(0),
  });
  assert.equal(await loadAuthUserFromToken(f.db, "expired"), null);
});
