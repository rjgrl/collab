import assert from "node:assert/strict";
import { it } from "node:test";
import express from "express";
import request from "supertest";
import { modelFixture } from "@Alumni-Tracking-Ss/api/test-utils/model-test-fixture";
import type { Context, AuthUser } from "@Alumni-Tracking-Ss/api/context";
import { apiRateLimits } from "./middleware/api-rate-limit";
import { setRequestContext } from "./middleware/request-context";
import { errorHandler } from "./middleware/error-handler";

it("shares API counters across instances, aliases and refreshed sessions, with separate user budgets", async (t) => {
  const old = process.env.API_RATE_LIMIT;
  process.env.API_RATE_LIMIT = "2";
  t.after(() => {
    if (old === undefined) delete process.env.API_RATE_LIMIT;
    else process.env.API_RATE_LIMIT = old;
  });
  const f = modelFixture();
  function app() {
    const a = express();
    const limits = apiRateLimits(f.db, "test");
    a.use(limits.ceiling);
    a.use((req, _res, next) => {
      const id = req.get("x-test-user");
      setRequestContext(req, { user: id ? ({ id } as AuthUser) : null } as Context);
      next();
    });
    a.use(limits.identity);
    a.get(/.*/, (_req, res) => res.json({ ok: true }));
    a.use(errorHandler);
    return a;
  }
  const a = app(),
    b = app();
  assert.equal((await request(a).get("/api/alumni")).status, 200);
  assert.equal((await request(b).get("/api/v1/auth/config")).status, 200);
  const denied = await request(a).get("/api/v1/alumni");
  assert.equal(denied.status, 429);
  assert.ok(Number(denied.headers["retry-after"]) > 0);
  assert.equal((await request(a).get("/static.js")).status, 200);
  for (const id of ["one", "two"]) {
    assert.equal((await request(a).get("/api/alumni").set("x-test-user", id)).status, 200);
    assert.equal((await request(b).get("/api/alumni").set("x-test-user", id)).status, 200);
    assert.equal((await request(b).get("/api/alumni").set("x-test-user", id)).status, 429);
  }
});

it("enforces the shared IP ceiling before authentication and refuses memory counters in production", async (t) => {
  const old = process.env.API_IP_RATE_LIMIT;
  process.env.API_IP_RATE_LIMIT = "1";
  t.after(() => {
    if (old === undefined) delete process.env.API_IP_RATE_LIMIT;
    else process.env.API_IP_RATE_LIMIT = old;
  });
  const f = modelFixture();
  const a = express();
  a.use(apiRateLimits(f.db, "test").ceiling);
  a.get(/.*/, (_req, res) => res.sendStatus(200));
  a.use(errorHandler);
  assert.equal((await request(a).get("/api/alumni")).status, 200);
  assert.equal((await request(a).get("/api/alumni")).status, 429);
  const oldStore = process.env.API_RATE_STORE;
  process.env.API_RATE_STORE = "memory";
  try {
    assert.throws(() => apiRateLimits(f.db, "production"), /mongodb/);
  } finally {
    if (oldStore === undefined) delete process.env.API_RATE_STORE;
    else process.env.API_RATE_STORE = oldStore;
  }
});
