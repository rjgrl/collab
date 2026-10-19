import assert from "node:assert/strict";
import { it } from "node:test";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { createApp } from "./app";
import { createContext } from "./context";
import { Hono } from "hono";

function fixture(status: "active" | "disabled" = "active") {
  const db = {
    session: {
      findUnique: async () => ({ id: "s", userId: "u", expiresAt: new Date(Date.now() + 60_000) }),
      deleteMany: async () => ({ count: 1 }),
    },
    user: {
      findUnique: async () => ({
        id: "u",
        name: "Test",
        email: "test@example.test",
        image: null,
        status,
        userRoles: [
          {
            role: {
              key: "test",
              rolePermissions: ["files.read", "files.write"].map((key) => ({
                permission: { key },
              })),
            },
          },
        ],
      }),
    },
    integrationSetting: { findUnique: async () => ({ enabled: true }) },
  } as unknown as Database;
  return createApp({
    db,
    config: { nodeEnv: "test", origin: "https://app.example.test" },
    integrationEnv: {
      appUrl: "https://api.example.test",
      googleClientId: "synthetic-client",
      googleClientSecret: "synthetic-secret",
    },
  });
}
it("does not trust forwarded headers for account audit/session metadata", async () => {
  const app = new Hono();
  app.get("/", async (c) => {
    const context = await createContext({ context: c, db: {} as Database, integrationEnv: {} });
    return c.json({ ip: context.ipAddress });
  });
  const response = await app.request("/", {
    headers: { "X-Forwarded-For": "203.0.113.77", Forwarded: "for=203.0.113.77" },
  });
  const payload: unknown = await response.json();
  assert.ok(payload && typeof payload === "object" && "ip" in payload);
  assert.equal(payload.ip, null);
});

it("rejects anonymous private file access and supplies security headers", async () => {
  const app = fixture();
  for (const [url, method] of [
    ["/api/files/file", "GET"],
    ["/api/files/evidence", "POST"],
  ]) {
    const response = await app.request(url!, { method });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});
it("rejects disabled session holders on raw file routes", async () => {
  const app = fixture("disabled");
  assert.equal(
    (await app.request("/api/files/file", { headers: { Cookie: "ats_session=synthetic" } })).status,
    401,
  );
  assert.equal(
    (
      await app.request("/api/files/evidence", {
        method: "POST",
        headers: { Cookie: "ats_session=synthetic", Origin: "https://app.example.test" },
      })
    ).status,
    401,
  );
});
it("blocks cross-origin mutation requests before database access", async () => {
  const response = await fixture().request("/api/auth/logout", {
    method: "POST",
    headers: { Origin: "https://attacker.example.test" },
  });
  assert.equal(response.status, 403);
});
it("rejects cookie mutations without trusted source headers on every transport", async () => {
  for (const path of ["/api/auth/logout", "/rpc/auth/logout", "/api-reference/auth/logout"]) {
    for (const source of [
      {},
      { Origin: "null" },
      { Referer: "https://app.example.test.attacker.test/" },
    ]) {
      const response = await fixture().request(path, {
        method: "POST",
        headers: { Cookie: "ats_session=synthetic", ...source },
      });
      assert.equal(response.status, 403, path);
    }
  }
});
it("shares the existing auth limit with OpenAPI and password-change aliases", async () => {
  const app = fixture();
  for (let attempt = 0; attempt < 30; attempt++)
    await app.request("/api/auth/login", { method: "POST" });
  for (const prefix of ["/rpc", "/api-reference", "/api"]) {
    for (const action of [
      "login",
      "signup",
      "changePassword",
      "sendVerification",
      "confirmVerification",
      "createGooglePassword",
      "completeProfile",
    ]) {
      const response = await app.request(`${prefix}/auth/${action}`, { method: "POST" });
      assert.equal(response.status, 429, `${prefix}/auth/${action}`);
      assert.ok(Number(response.headers.get("retry-after")) > 0);
    }
  }
});
it("does not reset authentication budgets through trailing-slash aliases", async () => {
  const app = fixture();
  for (let attempt = 0; attempt < 30; attempt++)
    await app.request("/api/auth/login", { method: "POST" });
  for (const prefix of ["/rpc", "/api-reference"]) {
    for (const action of ["login", "signup", "beginMfa", "resetPassword"]) {
      const response = await app.request(`${prefix}/auth/${action}/`, { method: "POST" });
      assert.equal(response.status, 429, `${prefix}/auth/${action}/`);
      assert.ok(Number(response.headers.get("retry-after")) > 0);
    }
  }
});
it("accepts trusted cookie sources and does not trust Referer over a foreign Origin", async () => {
  for (const headers of [
    { Origin: "https://app.example.test" },
    { Referer: "https://app.example.test/settings/account" },
  ]) {
    const response = await fixture().request("/api/auth/logout", {
      method: "POST",
      headers: { Cookie: "ats_session=synthetic", ...headers },
    });
    assert.equal(response.status, 200);
  }
  const response = await fixture().request("/api/auth/logout", {
    method: "POST",
    headers: {
      Cookie: "ats_session=synthetic",
      Origin: "https://attacker.test",
      Referer: "https://app.example.test/",
    },
  });
  assert.equal(response.status, 403);
  assert.equal(
    (
      await fixture().request("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: "Bearer synthetic" },
      })
    ).status,
    200,
  );
});
it("does not disclose database diagnostics through Forms errors", async () => {
  const diagnostic = "synthetic-private-database-diagnostic";
  const app = createApp({
    db: {
      integrationSetting: { findUnique: async () => ({ enabled: true }) },
      department: {
        findFirst: async () => {
          throw new Error(diagnostic);
        },
      },
      importJob: {
        create: async () => {
          throw new Error(diagnostic);
        },
      },
    } as unknown as Database,
    config: { nodeEnv: "test", origin: "https://app.example.test" },
    integrationEnv: { googleFormsWebhookSecret: "synthetic-webhook-secret" },
  });
  for (const body of [
    "null",
    "{",
    JSON.stringify({
      studentNumber: "TEST-1",
      firstName: "Test",
      lastName: "Member",
      gender: "Female",
      program: "BSIT",
      department: "COT",
    }),
  ]) {
    const response = await app.request("/api/integrations/google-forms/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": "synthetic-webhook-secret",
        "Idempotency-Key": "synthetic-error-submission-001",
      },
      body,
    });
    assert.equal(response.status, body.startsWith('{"') ? 500 : 400);
    assert.ok(!(await response.text()).includes(diagnostic));
  }
});
it("rejects invalid auth input and limits repeated attempts", async () => {
  const app = fixture();
  for (let attempt = 0; attempt < 30; attempt++) {
    assert.equal(
      (
        await app.request("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "invalid", password: "x" }),
        })
      ).status,
      400,
    );
  }
  assert.equal((await app.request("/api/auth/login", { method: "POST" })).status, 429);
});
it("rejects oversized uploads before multipart parsing", async () => {
  const response = await fixture().request("/api/files/evidence", {
    method: "POST",
    body: new Uint8Array(11 * 1024 * 1024),
  });
  assert.equal(response.status, 413);
});
it("binds OAuth state to an HttpOnly cookie and rejects a callback without it", async () => {
  const app = fixture();
  const start = await app.request("/api/auth/google");
  const state = new URL(start.headers.get("location")!).searchParams.get("state");
  assert.match(state!, /^[a-f0-9]{64}$/);
  assert.match(start.headers.get("set-cookie")!, /HttpOnly/);
  const callback = await app.request("/api/auth/google/callback?code=synthetic&state=" + state);
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get("location"), "https://app.example.test/login?error=google");
});

function googleFixture(existing = false, nodeEnv = "test") {
  const created: Record<string, unknown>[] = [];
  const account = {
    id: "google-user",
    name: "Google Member",
    email: "member@example.test",
    image: null,
    status: "active",
    needsProfileCompletion: false,
    passwordHash: "synthetic-existing-hash",
  };
  let sessions = 0;
  const db = {
    authThrottle: { upsert: async () => ({ count: 1 }) },
    integrationSetting: { findUnique: async () => ({ enabled: true }) },
    role: { findUnique: async () => ({ id: "viewer" }) },
    user: {
      findUnique: async () => (existing ? account : null),
      update: async () => account,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { ...account, ...data };
      },
    },
    session: {
      create: async () => {
        sessions++;
        return { id: "session" };
      },
    },
    auditLog: { create: async () => ({ id: "audit" }) },
  } as unknown as Database;
  const app = createApp({
    db,
    config: { nodeEnv, origin: "https://app.example.test" },
    integrationEnv: {
      appUrl: "https://api.example.test",
      googleClientId: "synthetic-client",
      googleClientSecret: "synthetic-secret",
    },
  });
  const callback = async () => {
    const start = await app.request("/api/auth/google");
    const state = new URL(start.headers.get("location")!).searchParams.get("state");
    return app.request(`/api/auth/google/callback?code=synthetic&state=${state}`, {
      headers: { Cookie: start.headers.get("set-cookie")!.split(";")[0]! },
    });
  };
  return { callback, created, sessions: () => sessions };
}

it("Google callback creates a passwordless account and redirects to profile completion", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) =>
    Response.json(
      String(url).includes("oauth2.googleapis.com/token")
        ? { access_token: "synthetic-access-token" }
        : { email: "member@example.test", name: "Google Member", verified_email: true },
    ),
  );
  const f = googleFixture();
  const response = await f.callback();
  assert.equal(response.headers.get("location"), "https://app.example.test/complete-profile");
  assert.match(response.headers.get("set-cookie")!, /ats_session=/);
  assert.equal(f.sessions(), 1);
  assert.equal(f.created[0]?.needsProfileCompletion, true);
  assert.equal("passwordHash" in f.created[0]!, false);
});

it("Google callback signs into an existing email without creating a duplicate", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) =>
    Response.json(
      String(url).includes("oauth2.googleapis.com/token")
        ? { access_token: "synthetic-access-token" }
        : { email: "member@example.test", verified_email: true },
    ),
  );
  const f = googleFixture(true);
  const response = await f.callback();
  assert.equal(response.headers.get("location"), "https://app.example.test/dashboard");
  assert.equal(f.created.length, 0);
  assert.equal(f.sessions(), 1);
});

it("Google callback refuses an unverified email without creating an account or session", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) =>
    Response.json(
      String(url).includes("oauth2.googleapis.com/token")
        ? { access_token: "synthetic-access-token" }
        : { email: "member@example.test", verified_email: false },
    ),
  );
  const f = googleFixture();
  assert.equal(
    (await f.callback()).headers.get("location"),
    "https://app.example.test/login?error=google",
  );
  assert.equal(f.created.length, 0);
  assert.equal(f.sessions(), 0);
});

it("Google provider failures return to login without issuing a session", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Synthetic provider timeout");
  });
  const f = googleFixture();
  assert.equal(
    (await f.callback()).headers.get("location"),
    "https://app.example.test/login?error=google",
  );
  assert.equal(f.created.length, 0);
  assert.equal(f.sessions(), 0);
});
it("uses a host-prefixed Secure HttpOnly cookie in production", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) =>
    Response.json(
      String(url).includes("oauth2.googleapis.com/token")
        ? { access_token: "synthetic-token" }
        : { email: "member@example.test", verified_email: true },
    ),
  );
  const response = await googleFixture(true, "production").callback();
  const cookies = response.headers.get("set-cookie")!;
  assert.match(cookies, /__Host-ats_session=/);
  assert.match(cookies, /HttpOnly/);
  assert.match(cookies, /Secure/);
  assert.match(cookies, /SameSite=Lax/);
});
it("shares MongoDB IP counters across app instances and authentication aliases", async () => {
  const previous = process.env.AUTH_IP_STORE;
  process.env.AUTH_IP_STORE = "mongodb";
  try {
    let count = 0;
    const db = {
      authThrottle: { upsert: async () => ({ count: ++count }) },
    } as unknown as Database;
    const a = createApp({
      db,
      config: { nodeEnv: "test", origin: "https://app.example.test" },
      integrationEnv: {},
    });
    const b = createApp({
      db,
      config: { nodeEnv: "test", origin: "https://app.example.test" },
      integrationEnv: {},
    });
    for (let i = 0; i < 30; i++)
      assert.equal(
        (await (i % 2 ? a : b).request("/api/auth/login", { method: "POST" })).status,
        400,
      );
    const response = await b.request("/api-reference/auth/login", { method: "POST" });
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get("retry-after")) > 0);
  } finally {
    if (previous === undefined) delete process.env.AUTH_IP_STORE;
    else process.env.AUTH_IP_STORE = previous;
  }
});
it("issues server-generated correlation IDs and readiness requires a writable primary", async () => {
  const db = { $runCommandRaw: async () => ({ isWritablePrimary: false }) } as unknown as Database;
  const app = createApp({
    db,
    config: { nodeEnv: "test", origin: "https://app.example.test" },
    integrationEnv: {},
  });
  const response = await app.request("/health/ready", {
    headers: { "X-Request-ID": "attacker-controlled" },
  });
  assert.equal(response.status, 503);
  assert.match(response.headers.get("x-request-id")!, /^[a-f0-9-]{36}$/);
  assert.notEqual(response.headers.get("x-request-id"), "attacker-controlled");
});
it("completion logs exclude query strings, credentials and caller-controlled request IDs", async (t) => {
  const previous = process.env.HTTP_LOGGING;
  process.env.HTTP_LOGGING = "true";
  const entries: unknown[] = [];
  t.mock.method(console, "info", (entry: unknown) => entries.push(entry));
  try {
    await fixture().request("/api/auth/login?token=SYNTHETIC_QUERY_SECRET", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-ID": "SYNTHETIC_HEADER_SECRET" },
      body: JSON.stringify({ password: "SYNTHETIC_PASSWORD_SECRET" }),
    });
    assert.equal(entries.length, 1);
    assert.ok(!JSON.stringify(entries).includes("SYNTHETIC_"));
    assert.deepEqual(Object.keys(JSON.parse(String(entries[0]))).sort(), [
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
