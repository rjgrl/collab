import assert from "node:assert/strict";
import { it } from "node:test";
import { modelFixture } from "./model-test-fixture";
import { hashPassword } from "@Alumni-Tracking-Ss/db";
import {
  createSession,
  destroySession,
  loadAuthUserFromToken,
  storedSessionToken,
  authenticateWithPassword,
} from "./session";
it("refunds successful login attempts while failed passwords exhaust the account budget", async () => {
  const password = "A private login testing passphrase 7878";
  const fixture = modelFixture({
    User: [
      {
        id: "u",
        email: "test@example.test",
        status: "active",
        passwordHash: await hashPassword(password),
      },
    ],
    UserRole: [{ userId: "u", roleId: "r" }],
  });
  const db = fixture.db;
  for (let i = 0; i < 6; i++)
    await authenticateWithPassword(db, { email: "test@example.test", password });
  assert.equal(fixture.tables.AuthThrottle?.[0]?.count, 0);
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
  const f = modelFixture({
    User: [
      {
        id: "u",
        name: "Test",
        email: "test@example.test",
        image: null,
        status: "active",
        passwordHash: "synthetic",
      },
    ],
  });
  return {
    db: f.db,
    get row() {
      return f.tables.Session?.[0] ?? null;
    },
    setRow: (value: Record<string, unknown>) => {
      f.tables.Session = [value];
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
