import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { it } from "node:test";
import { API_ROUTES, RAW_ROUTES, eachApiRoute } from "./api-routes";
import { buildOpenApiDocument } from "./openapi";

const committed = fileURLToPath(new URL("../../../docs/api/openapi.json", import.meta.url));

it("docs/api/openapi.json matches the route table (run `pnpm openapi` to update)", () => {
  const expected = `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;
  assert.equal(readFileSync(committed, "utf8").replaceAll("\r\n", "\n"), expected);
});

it("documents every route exactly once with a unique operation id", () => {
  const document = buildOpenApiDocument();
  const operations = Object.values(document.paths).flatMap((item) =>
    Object.entries(item as Record<string, { operationId?: string }>)
      .filter(([method]) => method !== "servers")
      .map(([, operation]) => operation.operationId),
  );
  const routes = [...eachApiRoute()];
  assert.equal(operations.length, routes.length + RAW_ROUTES.length);
  assert.equal(new Set(operations).size, operations.length);
  const signatures = routes.map(({ route }) => `${route.method} ${route.path}`);
  assert.equal(new Set(signatures).size, signatures.length, "two routes share a method and path");
  assert.ok(Object.keys(API_ROUTES).length > 10);
});

it("marks only sign-in and registration routes as public", () => {
  const publicRoutes = [...eachApiRoute()]
    .filter(({ route }) => route.public)
    .map(({ key }) => key)
    .sort();
  assert.deepEqual(publicRoutes, [
    "auth.config",
    "auth.forgotPassword",
    "auth.login",
    "auth.logout",
    "auth.me",
    "auth.registrationPrograms",
    "auth.resetPassword",
    "auth.signup",
  ]);
});
