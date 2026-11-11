import assert from "node:assert/strict";
import { it } from "node:test";
import request from "supertest";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { API_PREFIX, RAW_ROUTES, eachApiRoute } from "@Alumni-Tracking-Ss/contracts/api-routes";
import { createApp } from "./app";

const origin = "https://app.example.test";
/** Every model method resolves to "nothing found"; enough for routing checks without a database. */
const query = (value: unknown = null) => {
  const promise = Promise.resolve(value);
  return Object.assign(promise, {
    lean: () => query(value),
    sort: () => query(value),
    skip: () => query(value),
    limit: () => query(value),
    select: () => query(value),
    orFail: () => query(value),
    exec: () => promise,
  });
};
const model = new Proxy({}, { get: () => () => query() });
const db = new Proxy(
  {},
  {
    get: (_target, name) =>
      name === "ready"
        ? async () => undefined
        : name === "transaction"
          ? async () => {
              throw new Error("no database in routing test");
            }
          : model,
  },
) as unknown as Database;
const app = createApp({ db, config: { nodeEnv: "test", origin }, integrationEnv: {} });
const concrete = (path: string) =>
  path.replace(/:key/g, "email").replace(/:[A-Za-z]+/g, "0123456789abcdef01234567");

async function call(method: string, path: string) {
  const verb = method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete";
  return request(app)[verb](path).set("Origin", origin).send({});
}

it("serves every documented route on /api/v1 and on the deprecated /api alias", async () => {
  const routes = [
    ...[...eachApiRoute()].map(({ route }) => ({ method: route.method, path: route.path })),
    ...RAW_ROUTES.map(({ method, path }) => ({ method, path })),
  ];
  const missing: string[] = [];
  for (const { method, path } of routes) {
    for (const prefix of [API_PREFIX, "/api"]) {
      const response = await call(method, `${prefix}${concrete(path)}`);
      if ((response.body as { error?: string } | null)?.error === "Endpoint not found.")
        missing.push(`${method} ${prefix}${path}`);
    }
  }
  assert.deepEqual(missing, [], "documented routes the server does not serve");
});

it("marks unversioned paths deprecated and points to the /api/v1 successor", async () => {
  const legacy = await request(app).get("/api/auth/me");
  assert.match(String(legacy.headers.deprecation), /^@\d+$/);
  assert.equal(legacy.headers.link, `<${API_PREFIX}/auth/me>; rel="successor-version"`);
  const current = await request(app).get(`${API_PREFIX}/auth/me`);
  assert.equal(current.headers.deprecation, undefined);
  // Unknown paths stay unknown under both prefixes; the version segment is not a wildcard.
  const unknown = await request(app).get(`${API_PREFIX}/nope`);
  assert.equal(unknown.status, 404);
  // The first test detects missing routes by exactly this message.
  assert.equal((unknown.body as { error?: string }).error, "Endpoint not found.");
  assert.equal((await request(app).get("/api/v2/auth/me")).status, 404);
});

it("keeps the Google OAuth redirect endpoints unversioned and not deprecated", async () => {
  const start = await request(app).get("/api/auth/google");
  assert.equal(start.headers.deprecation, undefined);
  assert.notEqual((start.body as { error?: string }).error, "Endpoint not found.");
});

it("applies the authentication rate limit to versioned paths too", async () => {
  const limited = createApp({ db, config: { nodeEnv: "test", origin }, integrationEnv: {} });
  const previous = process.env.AUTH_IP_LIMIT;
  process.env.AUTH_IP_LIMIT = "30";
  try {
    let throttled = false;
    for (let attempt = 0; attempt < 40 && !throttled; attempt++)
      throttled =
        (
          await request(limited)
            .post(attempt % 2 ? `${API_PREFIX}/auth/login` : "/API/V1/auth/login")
            .set("Origin", origin)
            .send({})
        ).status === 429;
    assert.equal(throttled, true, "versioned sign-in requests must share the auth IP budget");
  } finally {
    if (previous === undefined) delete process.env.AUTH_IP_LIMIT;
    else process.env.AUTH_IP_LIMIT = previous;
  }
});
