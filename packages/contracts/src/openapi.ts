import { z } from "zod";
import {
  API_PREFIX,
  LEGACY_API_PREFIX,
  RAW_ROUTES,
  eachApiRoute,
  type ApiRoute,
} from "./api-routes";
import { errorResponseSchema } from "./common";

type JsonSchema = Record<string, unknown>;

/** OpenAPI path template from an Express path: /alumni/:id -> /alumni/{id}. */
const templatePath = (path: string) => path.replace(/:([A-Za-z]+)/g, "{$1}");
const pathParams = (path: string) => [...path.matchAll(/:([A-Za-z]+)/g)].map((match) => match[1]!);

function jsonSchema(schema: z.ZodType, io: "input" | "output"): JsonSchema {
  const result = z.toJSONSchema(schema, {
    io,
    unrepresentable: "any",
    // Dates travel as ISO 8601 strings in JSON.
    override: (context) => {
      if ((context.zodSchema as { _zod?: { def?: { type?: string } } })._zod?.def?.type === "date")
        Object.assign(context.jsonSchema, { type: "string", format: "date-time" });
    },
  }) as JsonSchema;
  delete result.$schema;
  return result;
}

/** void/undefined inputs (and optional wrappers of them) carry no parameters or body. */
function isEmptyInput(schema: z.ZodType) {
  const type = (schema as { _zod?: { def?: { type?: string } } })._zod?.def?.type;
  return type === "void" || type === "undefined";
}

const ERROR_STATUSES: Record<string, string> = {
  "400": "Invalid input",
  "401": "Sign-in required",
  "403": "Not allowed (permission, scope, MFA or origin)",
  "404": "Not found",
  "409": "Conflict (stale version, duplicate or wrong state)",
  "429": "Too many requests",
  "503": "Unavailable (maintenance mode, or a required service is not configured)",
};

/** "alumni.addContact" -> "Alumni: add contact". */
const summaryOf = (key: string) => {
  const [group, ...rest] = key.split(".");
  const words = rest
    .join(" ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return `${group!.charAt(0).toUpperCase()}${group!.slice(1)}: ${words}`;
};

function operation(key: string, route: ApiRoute) {
  const params = pathParams(route.path);
  const input = route.contract.input;
  const parameters: JsonSchema[] = params.map((name) => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
  let requestBody: JsonSchema | undefined;
  if (!isEmptyInput(input)) {
    const schema = jsonSchema(input, "input");
    const properties = { ...(schema.properties as Record<string, JsonSchema> | undefined) };
    const required = new Set((schema.required as string[]) ?? []);
    for (const name of params) {
      delete properties[name];
      required.delete(name);
    }
    if (route.method === "GET" || route.method === "DELETE") {
      for (const [name, property] of Object.entries(properties))
        parameters.push({ name, in: "query", required: required.has(name), schema: property });
    } else if (Object.keys(properties).length || !schema.properties) {
      requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: schema.properties ? { ...schema, properties, required: [...required] } : schema,
          },
        },
      };
    }
  }
  return {
    operationId: key,
    summary: summaryOf(key),
    tags: [key.split(".")[0]],
    ...(route.public ? { security: [] } : {}),
    ...(parameters.length ? { parameters } : {}),
    ...(requestBody ? { requestBody } : {}),
    responses: {
      "2XX": {
        description: "Success",
        content: { "application/json": { schema: jsonSchema(route.contract.output, "output") } },
      },
      ...errorResponses(),
    },
  };
}

const errorResponses = () =>
  Object.fromEntries(
    Object.entries(ERROR_STATUSES).map(([status, description]) => [
      status,
      { $ref: `#/components/responses/E${status}`, description },
    ]),
  );

function rawOperation(entry: (typeof RAW_ROUTES)[number]) {
  const params = pathParams(entry.path);
  const field = entry.path === "/backups/import" ? "backup" : "file";
  return {
    operationId: `${entry.method.toLowerCase()}${entry.path.replace(/[^A-Za-z0-9]+(.)?/g, (_m, next: string | undefined) => (next ?? "").toUpperCase())}`,
    summary: entry.summary,
    tags: [entry.path.split("/")[1]],
    ...(entry.kind === "redirect" || entry.kind === "webhook" ? { security: [] } : {}),
    ...(params.length
      ? {
          parameters: params.map((name) => ({
            name,
            in: "path",
            required: true,
            schema: { type: "string" },
          })),
        }
      : {}),
    ...(entry.kind === "upload"
      ? {
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: [field],
                  properties: { [field]: { type: "string", format: "binary" } },
                },
              },
            },
          },
        }
      : {}),
    responses: {
      ...(entry.kind === "download"
        ? {
            "200": {
              description: "File contents",
              content: {
                "application/octet-stream": { schema: { type: "string", format: "binary" } },
              },
            },
          }
        : entry.kind === "redirect"
          ? { "302": { description: "Browser redirect" } }
          : { "2XX": { description: "Success", content: { "application/json": { schema: {} } } } }),
      ...(entry.kind === "redirect" ? {} : errorResponses()),
    },
  };
}

/** The OpenAPI 3.1 description of the API, generated from API_ROUTES and RAW_ROUTES. */
export function buildOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  const add = (path: string, method: string, value: unknown) => {
    (paths[path] ??= {})[method.toLowerCase()] = value;
  };
  for (const { key, route } of eachApiRoute())
    add(templatePath(route.path), route.method, operation(key, route));
  for (const entry of RAW_ROUTES) {
    // OAuth redirect endpoints are deliberately unversioned (registered callback URL).
    const path = entry.kind === "redirect" ? `${LEGACY_API_PREFIX}${entry.path}` : entry.path;
    add(
      entry.kind === "redirect" ? `__absolute__${templatePath(path)}` : templatePath(path),
      entry.method,
      rawOperation(entry),
    );
  }
  const sorted = Object.fromEntries(
    Object.entries(paths)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, operations]) => [
        path.startsWith("__absolute__") ? path.slice("__absolute__".length) : path,
        path.startsWith("__absolute__") ? { servers: [{ url: "/" }], ...operations } : operations,
      ]),
  );
  return {
    openapi: "3.1.0",
    info: {
      title: "Alumni Tracking System API",
      version: "1",
      description: [
        `Base path: ${API_PREFIX}. The unversioned ${LEGACY_API_PREFIX} paths are deprecated aliases and respond with \`Deprecation\` and \`Link: rel="successor-version"\` headers.`,
        "Authentication is a session cookie set by sign-in. State-changing requests must come from the configured web origin (Origin header).",
        "Generated from packages/contracts/src/api-routes.ts by `pnpm openapi`; do not edit by hand.",
      ].join("\n\n"),
    },
    servers: [{ url: API_PREFIX }],
    security: [{ session: [] }],
    paths: sorted,
    components: {
      securitySchemes: {
        session: {
          type: "apiKey",
          in: "cookie",
          name: "__Host-ats_session",
          description: "Production cookie name; development uses ats_session.",
        },
      },
      schemas: { Error: jsonSchema(errorResponseSchema, "output") },
      responses: Object.fromEntries(
        Object.entries(ERROR_STATUSES).map(([status, description]) => [
          `E${status}`,
          {
            description,
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        ]),
      ),
    },
  };
}
