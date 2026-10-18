import assert from "node:assert/strict";
import { it } from "node:test";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { createApp } from "./app";

function fixture(status: "active" | "disabled" = "active") {
  const db = {
    session: {
      findUnique: async () => ({ id: "s", userId: "u", expiresAt: new Date(Date.now() + 60_000) }),
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
        headers: { Cookie: "ats_session=synthetic" },
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
