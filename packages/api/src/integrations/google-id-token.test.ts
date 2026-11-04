import assert from "node:assert/strict";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { beforeEach, it } from "node:test";
import { resetGoogleKeyCache, verifyGoogleIdToken } from "./google-id-token";

const clientId = "client-123.apps.googleusercontent.com";
const now = Date.UTC(2026, 10, 4);
const seconds = Math.floor(now / 1000);
const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
function token(
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> = { alg: "RS256", kid: "k1" },
  privateKey: KeyObject = key.privateKey,
) {
  const body = `${b64(header)}.${b64({
    iss: "https://accounts.google.com",
    aud: clientId,
    sub: "1234567890",
    iat: seconds - 10,
    exp: seconds + 3600,
    email: "head@buksu.edu.ph",
    email_verified: true,
    hd: "buksu.edu.ph",
    ...claims,
  })}`;
  return `${body}.${sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url")}`;
}

let requests: string[] = [];
let jwks: Record<string, unknown>[] = [];
const fakeFetch = async (url: string) => {
  requests.push(url);
  const body =
    url === "https://accounts.google.com/.well-known/openid-configuration"
      ? { jwks_uri: "https://www.googleapis.com/oauth2/v3/certs" }
      : url === "https://www.googleapis.com/oauth2/v3/certs"
        ? { keys: jwks }
        : null;
  return new Response(body ? JSON.stringify(body) : "", {
    status: body ? 200 : 404,
    headers: { "cache-control": "public, max-age=600" },
  });
};
const verifyToken = (value: string) =>
  verifyGoogleIdToken(value, clientId, { fetch: fakeFetch, now });

beforeEach(() => {
  resetGoogleKeyCache();
  requests = [];
  jwks = [{ ...key.publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" }];
});

it("accepts a correctly signed Google ID token and exposes hd from the verified claims", async () => {
  const claims = await verifyToken(token());
  assert.equal(claims.email, "head@buksu.edu.ph");
  assert.equal(claims.hd, "buksu.edu.ph");
  await verifyToken(token({ iss: "accounts.google.com" }));
  assert.equal(requests.length, 2, "keys are cached between verifications");
});

it("rejects forged, tampered, misaddressed, expired and unverified tokens", async () => {
  const valid = token();
  const [header, , signature] = valid.split(".");
  const tampered = `${header}.${b64({ iss: "https://accounts.google.com", aud: clientId, sub: "1", iat: seconds, exp: seconds + 60, email: "x@buksu.edu.ph", email_verified: true, hd: "buksu.edu.ph" })}.${signature}`;
  const cases: [string, string][] = [
    ["signed by another key", token({}, undefined, other.privateKey)],
    ["tampered payload", tampered],
    ["wrong audience", token({ aud: "someone-else" })],
    ["wrong issuer", token({ iss: "https://evil.test" })],
    ["expired", token({ exp: seconds - 3600 })],
    ["issued in the future", token({ iat: seconds + 3600 })],
    ["unverified email", token({ email_verified: false })],
    ["alg none", `${b64({ alg: "none", kid: "k1" })}.${valid.split(".")[1]}.`],
    ["alg HS256", token({}, { alg: "HS256", kid: "k1" })],
    ["unknown key id", token({}, { alg: "RS256", kid: "missing" })],
    ["malformed", "not-a-jwt"],
  ];
  for (const [name, value] of cases) await assert.rejects(() => verifyToken(value), Error, name);
});

it("refetches keys once when Google rotates to a new key id", async () => {
  await verifyToken(token());
  jwks = [{ ...other.publicKey.export({ format: "jwk" }), kid: "k2", alg: "RS256", use: "sig" }];
  await verifyToken(token({}, { alg: "RS256", kid: "k2" }, other.privateKey));
  assert.equal(requests.length, 4);
});
