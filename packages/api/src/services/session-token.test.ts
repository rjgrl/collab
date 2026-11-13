import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync, hkdfSync } from "node:crypto";
import { it } from "node:test";
import { SignJWT } from "jose";
import { modelFixture } from "../test-utils/model-test-fixture";
import { createSession, loadAuthUserFromToken } from "./session";
import { signSessionToken, verifySessionToken } from "./session-token";

const settings = { SESSION_SECRET: "s".repeat(64), NODE_ENV: "test" } as NodeJS.ProcessEnv;
const secret = "c".repeat(64);
const key = new Uint8Array(
  hkdfSync("sha256", settings.SESSION_SECRET!, "", "alumni-tracking session jwt v1", 32),
);
const later = () => new Date(Date.now() + 60_000);
const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const claims = (extra: Record<string, unknown> = {}) => ({
  iss: "alumni-tracking",
  aud: "alumni-tracking-web",
  sub: "u",
  jti: secret,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 60,
  ...extra,
});
/** Signs any header and claims with the real key, to isolate one check at a time. */
const hand = (header: Record<string, unknown>, payload: Record<string, unknown>) => {
  const body = `${b64(header)}.${b64(payload)}`;
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
};

it("round-trips a session JWT with the standard claims", async () => {
  const token = await signSessionToken({ secret, userId: "u", expiresAt: later() }, settings);
  const [header, payload] = token.split(".").map((part) => {
    try {
      return JSON.parse(Buffer.from(part, "base64url").toString());
    } catch {
      return null;
    }
  });
  assert.deepEqual(header, { alg: "HS256", typ: "JWT" });
  assert.equal(payload.iss, "alumni-tracking");
  assert.equal(payload.aud, "alumni-tracking-web");
  assert.equal(payload.sub, "u");
  assert.ok(payload.iat && payload.exp > payload.iat);
  assert.deepEqual(await verifySessionToken(token, settings), { secret, userId: "u" });
  assert.deepEqual(
    await verifySessionToken(hand({ alg: "HS256", typ: "JWT" }, claims()), settings),
    {
      secret,
      userId: "u",
    },
  );
});

it("rejects forged, altered, expired and malformed tokens", async () => {
  const valid = await signSessionToken({ secret, userId: "u", expiresAt: later() }, settings);
  const [header, payload, signature] = valid.split(".");
  const rejected = {
    "no token": "",
    "legacy opaque cookie": secret,
    "stored digest": `sha256:${"0".repeat(64)}`,
    "alg none": `${b64({ alg: "none", typ: "JWT" })}.${payload}.`,
    "payload swapped to another user": `${header}.${b64(claims({ sub: "admin" }))}.${signature}`,
    "signature removed": `${header}.${payload}.`,
    "other secret": await signSessionToken({ secret, userId: "u", expiresAt: later() }, {
      SESSION_SECRET: "t".repeat(64),
      NODE_ENV: "test",
    } as NodeJS.ProcessEnv),
    "HS512 with the real key": (() => {
      const body = `${b64({ alg: "HS512", typ: "JWT" })}.${b64(claims())}`;
      return `${body}.${createHmac("sha512", key).update(body).digest("base64url")}`;
    })(),
    "wrong issuer": hand({ alg: "HS256", typ: "JWT" }, claims({ iss: "someone-else" })),
    "wrong audience": hand({ alg: "HS256", typ: "JWT" }, claims({ aud: "other-app" })),
    "wrong type": hand({ alg: "HS256", typ: "at+jwt" }, claims()),
    expired: hand(
      { alg: "HS256", typ: "JWT" },
      claims({ exp: Math.floor(Date.now() / 1000) - 120 }),
    ),
    "missing subject": hand({ alg: "HS256", typ: "JWT" }, claims({ sub: undefined })),
    "missing jti": hand({ alg: "HS256", typ: "JWT" }, claims({ jti: undefined })),
    "short jti": hand({ alg: "HS256", typ: "JWT" }, claims({ jti: "abc" })),
  };
  for (const [name, token] of Object.entries(rejected))
    assert.equal(await verifySessionToken(token, settings), null, name);
});

it("rejects an RS256 token signed with a key pair, and HS256 keyed with a public key", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const rs256 = await new SignJWT(claims())
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .sign(privateKey);
  assert.equal(await verifySessionToken(rs256, settings), null);
  const pem = publicKey.export({ type: "spki", format: "pem" });
  const confused = await new SignJWT(claims())
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .sign(new Uint8Array(Buffer.from(pem)));
  assert.equal(await verifySessionToken(confused, settings), null);
});

it("refuses to sign in production without SESSION_SECRET", async () => {
  await assert.rejects(
    () =>
      signSessionToken({ secret, userId: "u", expiresAt: later() }, {
        NODE_ENV: "production",
      } as NodeJS.ProcessEnv),
    /SESSION_SECRET/,
  );
});

it("needs the live session too: revoked sessions and other users' sessions are rejected", async () => {
  const f = modelFixture({
    User: [
      {
        id: "u",
        name: "Test",
        email: "u@example.test",
        image: null,
        status: "active",
        passwordHash: "synthetic",
      },
    ],
  });
  const session = await createSession(f.db, "u", {});
  assert.ok(await loadAuthUserFromToken(f.db, session.token));
  // Same session secret presented under another user's name, correctly signed.
  const claimsOf = await verifySessionToken(session.token);
  const impersonation = await signSessionToken({
    secret: claimsOf!.secret,
    userId: "someone-else",
    expiresAt: later(),
  });
  assert.equal(await loadAuthUserFromToken(f.db, impersonation), null);
  // A validly signed token whose session was revoked (signed out) no longer works.
  f.tables.Session = [];
  assert.equal(await loadAuthUserFromToken(f.db, session.token), null);
});
