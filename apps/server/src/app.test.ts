import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { it, type TestContext } from "node:test";
import express from "express";
import request from "supertest";
import type { Database, PermissionKey } from "@Alumni-Tracking-Ss/db";
import { PERMISSION_KEYS } from "@Alumni-Tracking-Ss/db";
import { sealIntegrationCredentials } from "@Alumni-Tracking-Ss/db/integration-sealing";
import type { AuthUser } from "@Alumni-Tracking-Ss/api/context";
import { createApp } from "./app";
import { resetGoogleKeyCache } from "@Alumni-Tracking-Ss/api/integrations/google-id-token";
import { createContext } from "./context";
import { setMaintenance } from "@Alumni-Tracking-Ss/api/backups/restore";
const origin = "https://app.example.test";
const userId = "111111111111111111111111",
  alumniId = "222222222222222222222222",
  otherId = "333333333333333333333333",
  programId = "444444444444444444444444",
  departmentId = "555555555555555555555555";
function query<T>(value: T) {
  return Object.assign(Promise.resolve(value), {
    lean() {
      return this;
    },
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
    exec: async () => value,
  });
}
function bodyOf(response: { body: unknown }) {
  const value: unknown = response.body;
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function cookies(response: { headers: Record<string, unknown> }) {
  const value: unknown = response.headers["set-cookie"];
  assert.ok(Array.isArray(value));
  assert.ok(value.every((v) => typeof v === "string"));
  return value as string[];
}
function location(response: { headers: Record<string, unknown> }) {
  const value: unknown = response.headers.location;
  assert.equal(typeof value, "string");
  return String(value);
}
function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: userId,
    name: "Synthetic Test",
    email: "test@example.test",
    image: null,
    status: "active",
    roles: ["staff"],
    permissions: ["files.read", "files.write"],
    mfaEnrolled: false,
    mfaVerified: false,
    ...overrides,
  };
}
function fixture(
  options: {
    status?: "active" | "disabled";
    enrolled?: boolean;
    permissions?: PermissionKey[];
    roles?: string[];
    overrides?: Partial<AuthUser>;
    db?: object;
  } = {},
) {
  const db = {
    Session: { deleteMany: () => query({ deletedCount: 1 }) },
    AuditLog: { create: async () => ({ _id: otherId }) },
    IntegrationSetting: { findOne: () => query({ enabled: true }) },
    EvidenceFile: { findOne: () => query(null) },
    UserRole: { find: () => query([]) },
    Role: { find: () => query([]) },
    ...options.db,
  } as unknown as Database;
  return createApp({
    db,
    config: { nodeEnv: "test", origin },
    integrationEnv: {
      appUrl: "https://api.example.test",
      googleClientId: "synthetic-client",
      googleClientSecret: "synthetic-secret",
    },
    sessionLoader: async (_db, token) =>
      token && options.status !== "disabled"
        ? user({
            mfaEnrolled: options.enrolled,
            permissions: options.permissions ?? ["files.read", "files.write"],
            roles: options.roles ?? ["staff"],
            ...options.overrides,
          })
        : null,
  });
}
it("allows only sign-in essentials and Super Admin work during restore maintenance", async (t) => {
  let active = false;
  const backupState = {
    updateOne: (_filter: unknown, update: { $set?: { active?: boolean } }) => {
      active = Boolean(update.$set?.active);
      return query({ modifiedCount: 1 });
    },
    findById: () =>
      query(
        active
          ? { active: true, message: "The system is being restored from a backup." }
          : { active: false },
      ),
  };
  const dbOverride = { BackupState: backupState } as unknown as Database;
  await setMaintenance(dbOverride, true);
  t.after(() => setMaintenance(dbOverride, false));

  const anonymous = fixture({ db: { BackupState: backupState } });
  assert.notEqual((await request(anonymous).get("/api/auth/config")).status, 503);
  assert.notEqual((await request(anonymous).post("/api/auth/login").send({})).status, 503);
  for (const path of ["/api/auth/signup", "/api/auth/password-reset-requests", "/api/auth/profile"])
    assert.equal((await request(anonymous).post(path).send({})).status, 503, path);

  assert.equal(
    (
      await request(fixture({ roles: ["staff"] }))
        .get("/api/dashboard")
        .set("Cookie", "ats_session=synthetic")
    ).status,
    503,
  );
  assert.notEqual(
    (
      await request(fixture({ roles: ["super_admin"], enrolled: true }))
        .get("/api/dashboard")
        .set("Cookie", "ats_session=synthetic")
    ).status,
    503,
  );
});
it("lets a managed local Admin enter without an enrolled authenticator", async (t) => {
  const prior = {
    NODE_ENV: process.env.NODE_ENV,
    LOCAL_DISABLE_MFA: process.env.LOCAL_DISABLE_MFA,
    DATABASE_URL: process.env.DATABASE_URL,
  };
  t.after(() => {
    for (const [key, value] of Object.entries(prior))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  });
  process.env.NODE_ENV = "development";
  process.env.LOCAL_DISABLE_MFA = "true";
  process.env.DATABASE_URL = "mongodb://127.0.0.1:27018/collab_policy?replicaSet=rs0";
  assert.equal(
    (
      await request(fixture({ roles: ["super_admin"], enrolled: false }))
        .get("/api/files/" + otherId)
        .set("Cookie", "ats_session=synthetic")
    ).status,
    404,
  );
  assert.equal(
    (
      await request(fixture({ roles: ["super_admin"], enrolled: true, permissions: [] }))
        .get("/api/files/" + otherId)
        .set("Cookie", "ats_session=synthetic")
    ).status,
    403,
  );
  assert.equal(
    (
      await request(fixture({ status: "disabled", roles: ["super_admin"], enrolled: true }))
        .get("/api/files/" + otherId)
        .set("Cookie", "ats_session=synthetic")
    ).status,
    401,
  );
  process.env.LOCAL_DISABLE_MFA = "false";
  assert.equal(
    (
      await request(fixture({ roles: ["super_admin"], enrolled: true }))
        .get("/api/files/" + otherId)
        .set("Cookie", "ats_session=synthetic")
    ).status,
    403,
  );
});
it("enrolled Staff accounts have no Administrator MFA gate", async () => {
  assert.equal(
    (
      await request(fixture({ enrolled: true, roles: ["staff"] }))
        .get("/api/files/" + otherId)
        .set("Cookie", "ats_session=synthetic")
    ).status,
    404,
  );
});
it("production readiness refuses unavailable required contact-verification providers", async () => {
  const app = createApp({
    db: {
      ready: async () => {},
      connection: { db: { command: async () => ({ isWritablePrimary: true, setName: "rs0" }) } },
    } as unknown as Database,
    config: { nodeEnv: "production", origin },
    integrationEnv: {},
  });
  const response = await request(app).get("/health/ready");
  assert.equal(response.status, 503);
  assert.equal(response.body.checks.contactVerification, false);
});
it("does not trust forwarded headers for audit/session peer metadata", async () => {
  const app = express();
  app.get("/", async (req, res) => {
    const c = await createContext({
      request: req,
      response: res,
      db: {} as Database,
      integrationEnv: {},
      sessionLoader: async () => null,
    });
    res.json({ ip: c.ipAddress });
  });
  const response = await request(app)
    .get("/")
    .set("X-Forwarded-For", "203.0.113.77")
    .set("Forwarded", "for=203.0.113.77");
  const value = bodyOf(response);
  assert.notEqual(value.ip, "203.0.113.77");
  assert.match(String(value.ip), /127\.0\.0\.1|::1|::ffff:127/);
});
it("rejects anonymous private file access and supplies security headers", async () => {
  const app = fixture();
  for (const response of [
    await request(app).get("/api/files/" + otherId),
    await request(app).post("/api/files/evidence"),
  ]) {
    assert.equal(response.status, 401);
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.headers["cache-control"], "no-store");
  }
});
it("rejects disabled session holders on private file routes", async () => {
  const app = fixture({ status: "disabled" });
  assert.equal(
    (
      await request(app)
        .get("/api/files/" + otherId)
        .set("Cookie", "ats_session=synthetic")
    ).status,
    401,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/files/evidence")
        .set("Cookie", "ats_session=synthetic")
        .set("Origin", origin)
    ).status,
    401,
  );
});
it("blocks cross-origin mutations before database access", async () => {
  assert.equal(
    (
      await request(fixture())
        .post("/api/auth/logout")
        .set("Origin", "https://attacker.example.test")
    ).status,
    403,
  );
});
it("rejects cookie mutations with missing, null or deceptive source headers on all paths", async () => {
  for (const path of [
    "/api/auth/logout",
    "/rpc/auth/logout",
    "/api-reference/auth/logout",
    "/api/me/profile",
  ]) {
    for (const source of [
      {},
      { Origin: "null" },
      { Referer: "https://app.example.test.attacker.test/" },
    ]) {
      const response = await request(fixture())
        .post(path)
        .set("Cookie", "ats_session=synthetic")
        .set(source);
      assert.equal(response.status, 403, path);
    }
  }
});
const canonicalAuthMutations = [
  ["post", "login"],
  ["post", "signup"],
  ["patch", "password"],
  ["post", "verification-challenges"],
  ["post", "verification-confirmations"],
  ["post", "password"],
  ["patch", "profile-completion"],
  ["post", "mfa/enrollments"],
  ["post", "password-resets"],
] as const;
it("shares the authentication budget across canonical REST auth mutations", async () => {
  const app = fixture();
  for (let i = 0; i < 30; i++)
    assert.equal((await request(app).post("/api/auth/login")).status, 400);
  for (const [method, path] of canonicalAuthMutations) {
    const response = await request(app)[method]("/api/auth/" + path);
    assert.equal(response.status, 429, path);
    assert.ok(Number(response.headers["retry-after"]) > 0);
    assert.equal(response.body.requestId, response.headers["x-request-id"]);
  }
});
it("does not reset authentication budgets through trailing slashes", async () => {
  const app = fixture();
  for (let i = 0; i < 30; i++) await request(app).post("/api/auth/login");
  for (const [method, path] of canonicalAuthMutations) {
    const response = await request(app)[method]("/api/auth/" + path + "/");
    assert.equal(response.status, 429, path);
    assert.ok(Number(response.headers["retry-after"]) > 0);
  }
});
it("removes RPC/OpenAPI action aliases instead of providing an unthrottled alternate transport", async () => {
  const app = fixture();
  for (const prefix of ["/rpc", "/api-reference"])
    for (const action of ["login", "signup", "beginMfa", "resetPassword"])
      assert.equal((await request(app).post(prefix + "/auth/" + action)).status, 404);
});
it("accepts trusted cookie sources and never lets Referer override a foreign Origin", async () => {
  for (const source of [{ Origin: origin }, { Referer: origin + "/settings/account" }])
    assert.equal(
      (
        await request(fixture())
          .post("/api/auth/logout")
          .set("Cookie", "ats_session=synthetic")
          .set(source)
      ).status,
      200,
    );
  assert.equal(
    (
      await request(fixture())
        .post("/api/auth/logout")
        .set("Cookie", "ats_session=synthetic")
        .set("Origin", "https://attacker.test")
        .set("Referer", origin + "/")
    ).status,
    403,
  );
  assert.equal(
    (await request(fixture()).post("/api/auth/logout").set("Authorization", "Bearer synthetic"))
      .status,
    200,
  );
});
it("does not disclose database diagnostics through malformed or failed Forms requests", async () => {
  const diagnostic = "synthetic-private-database-diagnostic";
  const db = {
    IntegrationSetting: { findOne: () => query({ enabled: true }) },
    FormsReceipt: { findOne: () => query(null), create: async () => ({}) },
    Department: {
      find: () => {
        throw Error(diagnostic);
      },
    },
    ImportJob: {
      create: async () => {
        throw Error(diagnostic);
      },
    },
    transaction: async <T>(work: (tx: Database) => Promise<T>) => work(db as unknown as Database),
  };
  const app = createApp({
    db: db as unknown as Database,
    config: { nodeEnv: "test", origin },
    integrationEnv: { googleFormsWebhookSecret: "synthetic-webhook-secret" },
    sessionLoader: async () => null,
  });
  for (const body of [
    "null",
    "{",
    JSON.stringify({
      studentNumber: "TEST-1",
      graduationYear: 2024,
      firstName: "Test",
      lastName: "Member",
      gender: "Female",
      program: "BSIT",
      department: "COT",
    }),
  ]) {
    const response = await request(app)
      .post("/api/integrations/google-forms/webhook")
      .set("Content-Type", "application/json")
      .set("x-webhook-secret", "synthetic-webhook-secret")
      .set("Idempotency-Key", "synthetic-error-submission-001")
      .send(body);
    assert.equal(response.status, body.startsWith('{"') ? 500 : 400);
    assert.ok(!JSON.stringify(bodyOf(response)).includes(diagnostic));
  }
});
it("rejects invalid auth input and limits repeated attempts", async () => {
  const app = fixture();
  for (let i = 0; i < 30; i++)
    assert.equal(
      (await request(app).post("/api/auth/login").send({ email: "invalid", password: "x" })).status,
      400,
    );
  assert.equal((await request(app).post("/api/auth/login")).status, 429);
});
it("rejects oversized declared uploads before multipart parsing or authentication", async () => {
  assert.equal(
    (
      await request(fixture())
        .post("/api/files/evidence")
        .set("Content-Type", "application/octet-stream")
        .set("Content-Length", String(11 * 1024 * 1024))
        .send(Buffer.alloc(1))
    ).status,
    413,
  );
});
it("binds OAuth state to an HttpOnly cookie and rejects callbacks without that cookie", async () => {
  const app = fixture();
  const start = await request(app).get("/api/auth/google");
  const state = new URL(location(start)).searchParams.get("state");
  assert.match(state!, /^[a-f0-9]{64}$/);
  assert.match(cookies(start).join(";"), /HttpOnly/);
  const callback = await request(app).get(
    "/api/auth/google/callback?code=synthetic&state=" + state,
  );
  assert.equal(callback.status, 302);
  assert.equal(location(callback), origin + "/login?error=google");
});
function googleFixture(existing = false, nodeEnv = "test", roleKey = "alumni") {
  const created: Record<string, unknown>[] = [];
  let sessions = 0;
  const account = {
    _id: userId,
    name: "Google Member",
    email: "member@example.test",
    emailVerified: true,
    image: null,
    status: "active",
    needsProfileCompletion: false,
    passwordHash: "synthetic-existing-hash",
    verificationRequired: false,
  };

  // For production, provide sealed credentials in the database
  const testKey = Buffer.from("12".repeat(32), "hex");
  const sealedCreds = sealIntegrationCredentials(testKey, "google_auth", {
    clientId: "synthetic-client",
    clientSecret: "synthetic-secret",
  });
  const googleAuthRow = {
    _id: "google_auth_row",
    key: "google_auth",
    enabled: true,
    credentials: sealedCreds.credentials,
    credentialHints: sealedCreds.credentialHints,
    keyFingerprint: sealedCreds.keyFingerprint,
  };

  const db = {
    AuthThrottle: { findOneAndUpdate: () => query({ count: 1 }) },
    IntegrationSetting: {
      findOne: () => query({ enabled: true }),
      find: () =>
        Object.assign(
          Promise.resolve(
            nodeEnv === "production" ? [googleAuthRow] : [], // Non-production doesn't need seeded creds
          ),
          {
            lean: function () {
              return this;
            },
            exec: async function () {
              return await this;
            },
          },
        ),
    },
    Role: {
      findOne: () => query({ _id: otherId, key: "alumni" }),
      find: () => query([{ _id: otherId, key: roleKey, name: roleKey, isSystem: true }]),
    },
    RolePermission: { find: () => query([]) },
    Permission: { find: () => query([]) },
    UserRole: {
      create: async () => ({}),
      find: () => query(existing ? [{ _id: otherId, userId, roleId: otherId }] : []),
    },
    User: {
      findOne: () => query(existing ? account : null),
      findOneAndUpdate: () => query(account),
      create: async (data: Record<string, unknown>) => {
        created.push(data);
        const object = { ...account, ...data };
        return { toObject: () => object };
      },
    },
    Session: {
      create: async () => {
        sessions++;
        return { _id: otherId };
      },
    },
    AuditLog: { create: async () => ({ _id: otherId }) },
    transaction: async <T>(work: (tx: Database) => Promise<T>) => work(db as unknown as Database),
  };

  // In production, use the test key; in test mode, include env credentials
  const integrationEnv =
    nodeEnv === "production"
      ? {
          appUrl: "https://api.example.test",
          integrationEncryptionKey: "12".repeat(32), // Match the test key
        }
      : {
          appUrl: "https://api.example.test",
          googleClientId: "synthetic-client",
          googleClientSecret: "synthetic-secret",
        };

  const app = createApp({
    db: db as unknown as Database,
    config: { nodeEnv, origin },
    integrationEnv,
    sessionLoader: async () => null,
  });
  const callback = async () => {
    const start = await request(app).get("/api/auth/google");
    const state = new URL(location(start)).searchParams.get("state");
    return request(app)
      .get("/api/auth/google/callback?code=synthetic&state=" + state)
      .set("Cookie", cookies(start)[0]!.split(";")[0]!);
  };
  return { callback, created, sessions: () => sessions };
}
const googleKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
function mockGoogle(t: TestContext, profile: Record<string, unknown>) {
  resetGoogleKeyCache();
  const seconds = Math.floor(Date.now() / 1000);
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const { verified_email, ...claims } = profile;
  const body = `${part({ alg: "RS256", kid: "synthetic" })}.${part({
    iss: "https://accounts.google.com",
    aud: "synthetic-client",
    sub: "synthetic-subject",
    iat: seconds,
    exp: seconds + 600,
    email_verified: verified_email,
    ...claims,
  })}`;
  const idToken = `${body}.${sign("RSA-SHA256", Buffer.from(body), googleKey.privateKey).toString("base64url")}`;
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    const target = String(url);
    if (target.includes("oauth2.googleapis.com/token")) return Response.json({ id_token: idToken });
    if (target.includes("openid-configuration"))
      return Response.json({ jwks_uri: "https://www.googleapis.com/oauth2/v3/certs" });
    if (target.includes("oauth2/v3/certs"))
      return Response.json({
        keys: [
          { ...googleKey.publicKey.export({ format: "jwk" }), kid: "synthetic", alg: "RS256" },
        ],
      });
    return new Response("", { status: 404 });
  });
}
it("Google callback creates a passwordless account and redirects to profile completion", async (t) => {
  mockGoogle(t, { email: "member@example.test", name: "Google Member", verified_email: true });
  const f = googleFixture();
  const response = await f.callback();
  assert.equal(location(response), origin + "/complete-profile");
  assert.match(cookies(response).join(";"), /ats_session=/);
  assert.equal(f.sessions(), 1);
  assert.equal(f.created[0]?.needsProfileCompletion, true);
  assert.equal(f.created[0]?.passwordHash, null);
});
it("Google callback signs into an existing verified email without creating a duplicate", async (t) => {
  mockGoogle(t, { email: "member@example.test", verified_email: true });
  const f = googleFixture(true);
  const response = await f.callback();
  assert.equal(location(response), origin + "/dashboard");
  assert.equal(f.created.length, 0);
  assert.equal(f.sessions(), 1);
});
it("Google callback refuses unverified email without creating an account or session", async (t) => {
  mockGoogle(t, { email: "member@example.test", verified_email: false });
  const f = googleFixture();
  assert.equal(location(await f.callback()), origin + "/login?error=google");
  assert.equal(f.created.length, 0);
  assert.equal(f.sessions(), 0);
});
it("Google callback rejects staff accounts outside the institutional Workspace", async (t) => {
  const previous = process.env.STAFF_EMAIL_DOMAINS;
  process.env.STAFF_EMAIL_DOMAINS = "example.test";
  try {
    // Allowlisted email domain but no verified hd claim: a consumer Google account.
    mockGoogle(t, { email: "member@example.test", verified_email: true });
    const f = googleFixture(true, "test", "staff");
    assert.equal(location(await f.callback()), origin + "/login?error=google_domain");
    assert.equal(f.sessions(), 0);
    t.mock.restoreAll();
    mockGoogle(t, { email: "member@example.test", verified_email: true, hd: "example.test" });
    assert.equal(
      location(await googleFixture(true, "test", "staff").callback()),
      origin + "/dashboard",
    );
  } finally {
    if (previous === undefined) delete process.env.STAFF_EMAIL_DOMAINS;
    else process.env.STAFF_EMAIL_DOMAINS = previous;
  }
});
it("Google provider failures return to login without issuing a session", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw Error("Synthetic provider timeout");
  });
  const f = googleFixture();
  assert.equal(location(await f.callback()), origin + "/login?error=google");
  assert.equal(f.created.length, 0);
  assert.equal(f.sessions(), 0);
});
it("uses a host-prefixed Secure HttpOnly session cookie in production", async (t) => {
  mockGoogle(t, { email: "member@example.test", verified_email: true });
  const response = await googleFixture(true, "production").callback();
  const value = cookies(response).join(";");
  assert.match(value, /__Host-ats_session=/);
  assert.match(value, /HttpOnly/);
  assert.match(value, /Secure/);
  assert.match(value, /SameSite=Lax/);
});
it("shares MongoDB IP counters across app instances and canonical authentication routes", async () => {
  const prior = process.env.AUTH_IP_STORE;
  process.env.AUTH_IP_STORE = "mongodb";
  try {
    let count = 0;
    const db = {
      AuthThrottle: { findOneAndUpdate: () => query({ count: ++count }) },
    } as unknown as Database;
    const options = {
      db,
      config: { nodeEnv: "test", origin },
      integrationEnv: {},
      sessionLoader: async () => null,
    };
    const a = createApp(options),
      b = createApp(options);
    for (let i = 0; i < 30; i++)
      assert.equal((await request(i % 2 ? a : b).post("/api/auth/login")).status, 400);
    const response = await request(b).post("/api/auth/password-resets");
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers["retry-after"]) > 0);
  } finally {
    if (prior === undefined) delete process.env.AUTH_IP_STORE;
    else process.env.AUTH_IP_STORE = prior;
  }
});
it("issues server-generated correlation IDs and readiness requires a writable primary", async () => {
  const db = {
    ready: async () => {},
    connection: { db: { command: async () => ({ isWritablePrimary: false, setName: "rs0" }) } },
  } as unknown as Database;
  const app = createApp({
    db,
    config: { nodeEnv: "test", origin },
    integrationEnv: {},
    sessionLoader: async () => null,
  });
  const response = await request(app)
    .get("/health/ready")
    .set("X-Request-ID", "attacker-controlled");
  assert.equal(response.status, 503);
  assert.match(String(response.headers["x-request-id"]), /^[a-f0-9-]{36}$/);
  assert.notEqual(response.headers["x-request-id"], "attacker-controlled");
});
it("completion logs exclude queries, credentials and caller-controlled request IDs", async (t) => {
  const previous = process.env.HTTP_LOGGING;
  process.env.HTTP_LOGGING = "true";
  const entries: unknown[] = [];
  t.mock.method(console, "info", (entry: unknown) => entries.push(entry));
  try {
    await request(fixture())
      .post("/api/auth/login?token=SYNTHETIC_QUERY_SECRET")
      .set("X-Request-ID", "SYNTHETIC_HEADER_SECRET")
      .send({ password: "SYNTHETIC_PASSWORD_SECRET" });
    assert.equal(entries.length, 1);
    assert.ok(!JSON.stringify(entries).includes("SYNTHETIC_"));
    const parsed: unknown = JSON.parse(String(entries[0]));
    assert.ok(parsed && typeof parsed === "object");
    assert.deepEqual(Object.keys(parsed).sort(), [
      "category",
      "durationMs",
      "event",
      "method",
      "requestId",
      "status",
    ]);
  } finally {
    if (previous === undefined) delete process.env.HTTP_LOGGING;
    else process.env.HTTP_LOGGING = previous;
  }
});
it("HTTP rejects Alumni directory access despite broad permissions and requires explicit linking for My Profile", async () => {
  const app = fixture({
    roles: ["alumni"],
    permissions: [...PERMISSION_KEYS],
    db: { User: { findOne: () => query({ _id: userId, alumniId: null }) } },
  });
  for (const path of [
    "/api/alumni",
    "/api/alumni/" + otherId,
    "/api/users",
    "/api/departments",
    "/api/reports",
    "/api/dashboard",
  ])
    assert.equal(
      (await request(app).get(path).set("Authorization", "Bearer synthetic")).status,
      403,
      path,
    );
  const response = await request(app)
    .get("/api/me/profile")
    .set("Authorization", "Bearer synthetic");
  assert.equal(response.status, 409);
  assert.match(String(bodyOf(response).error), /linked/);
});
it("HTTP validates ObjectIds and rejects body-supplied owners, roles and URL IDs", async () => {
  const app = fixture({ roles: ["staff"], permissions: [...PERMISSION_KEYS] });
  for (const path of ["/api/alumni/bad", "/api/programs/$ne", "/api/files/not-an-id"])
    assert.equal(
      (await request(app).get(path).set("Authorization", "Bearer synthetic")).status,
      400,
      path,
    );
  const alumniApp = fixture({ roles: ["alumni"], permissions: [...PERMISSION_KEYS] });
  for (const field of [
    "alumniId",
    "programId",
    "studentNumber",
    "roles",
    "isTracked",
    "employmentStatus",
  ])
    assert.equal(
      (
        await request(alumniApp)
          .patch("/api/me/profile")
          .set("Authorization", "Bearer synthetic")
          .send({ mobileNumber: "+639171234567", [field]: "hostile" })
      ).status,
      400,
      field,
    );
  assert.equal(
    (
      await request(app)
        .patch("/api/alumni/" + alumniId)
        .set("Authorization", "Bearer synthetic")
        .send({ id: otherId })
    ).status,
    400,
  );
});
it("HTTP private evidence rejects another alumni owner's file without reading storage", async () => {
  const app = fixture({
    roles: ["alumni"],
    permissions: ["files.read"],
    db: {
      User: { findOne: () => query({ _id: userId, alumniId }) },
      Alumni: {
        findOne: () =>
          query({
            _id: alumniId,
            studentNumber: "SYN-1",
            firstName: "Own",
            lastName: "Profile",
            programId,
          }),
      },
      EvidenceFile: {
        findOne: () =>
          query({
            _id: otherId,
            alumniId: departmentId,
            originalName: "other.pdf",
            mimeType: "application/pdf",
            sizeBytes: 10,
            provider: "local",
            storageKey: "must-not-be-read",
          }),
      },
    },
  });
  const response = await request(app)
    .get("/api/files/" + otherId)
    .set("Authorization", "Bearer synthetic");
  assert.equal(response.status, 403);
  assert.match(String(bodyOf(response).error), /own linked profile/);
});

it("integrations are Admin-only even when Staff have all permissions", async () => {
  const app = fixture({
    permissions: [...PERMISSION_KEYS],
    db: { IntegrationSetting: { find: () => query([]) } },
  });
  assert.equal(
    (await request(app).get("/api/integrations").set("Cookie", "ats_session=synthetic")).status,
    403,
  );
  for (const [method, path, body] of [
    [
      "post",
      "/api/integrations/recaptcha/enable",
      { credentials: { siteKey: "a", secretKey: "b" } },
    ],
    ["put", "/api/integrations/recaptcha/credentials", { credentials: {} }],
    ["post", "/api/integrations/recaptcha/disable", {}],
  ] as const)
    assert.equal(
      (
        await request(app)
          [method](path)
          .set("Origin", origin)
          .set("Cookie", "ats_session=synthetic")
          .send(body)
      ).status,
      403,
      path,
    );
  // The old toggle that enabled without credentials no longer exists.
  assert.equal(
    (
      await request(app)
        .patch("/api/integrations/recaptcha")
        .set("Origin", origin)
        .set("Cookie", "ats_session=synthetic")
        .send({ enabled: true })
    ).status,
    404,
  );
});
it("Faculty endpoints require sign-in", async () => {
  const app = fixture({
    permissions: [...PERMISSION_KEYS],
    db: { Faculty: { find: () => query([]) } },
  });
  assert.equal((await request(app).get("/api/faculty")).status, 401);
});
