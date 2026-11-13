import assert from "node:assert/strict";
import { it } from "node:test";
import { modelFixture } from "../test-utils/model-test-fixture";
import { hashPassword } from "@Alumni-Tracking-Ss/db";
import { decodeJwt } from "jose";
import {
  createSession,
  destroySession,
  loadAuthUserFromToken,
  storedSessionToken,
  authenticateWithPassword,
} from "./session";
import { signSessionToken } from "./session-token";
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
  const secret = String(decodeJwt(session.token).jti);
  assert.equal(f.row!.token, storedSessionToken(secret));
  assert.equal(session.storageToken, f.row!.token);
  assert.ok(!String(f.row!.token).includes(secret));
  assert.ok(await loadAuthUserFromToken(f.db, session.token));
  assert.equal(await loadAuthUserFromToken(f.db, String(f.row!.token)), null);
  // The bare session secret is not a credential without the signed JWT around it.
  assert.equal(await loadAuthUserFromToken(f.db, secret), null);
  await destroySession(f.db, secret);
  assert.equal(await loadAuthUserFromToken(f.db, session.token), null);
});
it("lazily migrates valid legacy sessions and rejects idle/absolute expiration", async () => {
  const f = fixture();
  const legacy = "a".repeat(64);
  const jwt = (secret: string) =>
    signSessionToken({ secret, userId: "u", expiresAt: new Date(Date.now() + 60_000) });
  f.setRow({
    id: "s",
    userId: "u",
    token: legacy,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  });
  assert.ok(await loadAuthUserFromToken(f.db, await jwt(legacy)));
  assert.equal(f.row!.token, storedSessionToken(legacy));
  f.row!.createdAt = new Date(0);
  assert.equal(await loadAuthUserFromToken(f.db, await jwt(legacy)), null);
  const expired = "b".repeat(64);
  f.setRow({
    id: "s",
    userId: "u",
    token: storedSessionToken(expired),
    createdAt: new Date(),
    expiresAt: new Date(0),
  });
  assert.equal(await loadAuthUserFromToken(f.db, await jwt(expired)), null);
});
