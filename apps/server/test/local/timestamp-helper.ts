// Test-only: obtain a genuine timestamp-edit context before a protected write, as the web client does.
import type { Express } from "express";
import request from "supertest";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { TIMESTAMP_EDIT_HEADER } from "@Alumni-Tracking-Ss/contracts/timestamp";

type Begin = (input: {
  purpose: string;
  alumniIds: string[];
}) => Promise<{ status: number; body: unknown }>;
const id = "([a-f\\d]{24})";

/** Which protected alumni a request touches, mirroring the server's route coverage. */
async function target(
  db: Database,
  me: () => Promise<string | null>,
  method: string,
  url: string,
  body: unknown,
) {
  const path = url.replace(/^\/api(\/v1)?/, "").split("?")[0]!;
  const fields = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const jobOwner = async (job: string) => {
    const row = await db.Employment.findById(job).select("alumniId").lean();
    return row ? String(row.alumniId) : null;
  };
  let match: RegExpMatchArray | null;
  if (method === "PATCH" && (match = path.match(new RegExp(`^/alumni/${id}$`, "i"))))
    return { purpose: "details", alumniIds: [match[1]!] };
  if (method === "POST" && (match = path.match(new RegExp(`^/alumni/${id}/employments$`, "i"))))
    return { purpose: "employment", alumniIds: [match[1]!] };
  if (
    ["PATCH", "DELETE"].includes(method) &&
    (match = path.match(new RegExp(`^/(me/)?employments/${id}$`, "i")))
  ) {
    const owner = await jobOwner(match[2]!);
    return owner ? { purpose: "employment", alumniIds: [owner] } : null;
  }
  if (method === "POST" && path === "/me/employments") {
    const owner = await me();
    return owner ? { purpose: "employment", alumniIds: [owner] } : null;
  }
  if (method === "POST" && path === "/alumni/assign" && Array.isArray(fields.alumniIds))
    return { purpose: "assignment", alumniIds: fields.alumniIds.map(String) };
  if (method === "PATCH" && path === "/auth/profile") {
    const owner = await me();
    return owner ? { purpose: "account", alumniIds: [owner] } : null;
  }
  if (method === "PATCH" && (match = path.match(new RegExp(`^/users/${id}$`, "i")))) {
    const user = await db.User.findById(match[1]!).select("alumniId").lean();
    return user?.alumniId ? { purpose: "account", alumniIds: [String(user.alumniId)] } : null;
  }
  return null;
}

/** Cookie-authenticated supertest write that first obtains a genuine edit context when protected. */
export function protectedRequest(app: Express, db: Database, origin: string) {
  return async (
    cookie: string,
    method: "post" | "patch" | "delete",
    url: string,
    body?: object,
  ) => {
    const headers = await timestampHeaders(
      db,
      async (input) =>
        request(app)
          .post("/api/v1/alumni/timestamp-edits")
          .set("Cookie", cookie)
          .set("Origin", origin)
          .send(input),
      async () => {
        const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
        return me.body?.alumniId ? String(me.body.alumniId) : null;
      },
      method,
      url,
      body,
    );
    const test = request(app)[method](url).set("Cookie", cookie).set("Origin", origin).set(headers);
    return body === undefined ? test : test.send(body);
  };
}

/** Headers for a supertest agent (cookies retained by the agent). */
export function agentTimestampHeaders(
  agent: ReturnType<typeof request.agent>,
  db: Database,
  origin: string,
) {
  return (method: string, url: string, body?: object) =>
    timestampHeaders(
      db,
      async (input) =>
        agent.post("/api/v1/alumni/timestamp-edits").set("Origin", origin).send(input),
      async () => {
        const me = await agent.get("/api/auth/me");
        return me.body?.alumniId ? String(me.body.alumniId) : null;
      },
      method,
      url,
      body,
    );
}

/** Bearer-token begin/lookup callbacks for fetch-based acceptance scripts. */
export function bearerTimestampHeaders(
  db: Database,
  call: (
    path: string,
    method: string,
    input?: unknown,
  ) => Promise<{ status: number; body: unknown }>,
) {
  return (method: string, url: string, body?: unknown) =>
    timestampHeaders(
      db,
      (input) => call("/api/v1/alumni/timestamp-edits", "POST", input),
      async () => {
        const me = (await call("/api/auth/me", "GET")).body as { alumniId?: unknown } | null;
        return me?.alumniId ? String(me.alumniId) : null;
      },
      method,
      url,
      body,
    );
}

/** Headers for a protected write; empty when nothing is protected or the actor may not begin one. */
export async function timestampHeaders(
  db: Database,
  begin: Begin,
  me: () => Promise<string | null>,
  method: string,
  url: string,
  body?: unknown,
): Promise<Record<string, string>> {
  const protectedTarget = await target(db, me, method.toUpperCase(), url, body);
  if (!protectedTarget) return {};
  const started = await begin(protectedTarget);
  const token = (started.body as { token?: unknown } | null)?.token;
  return started.status === 201 && typeof token === "string"
    ? { [TIMESTAMP_EDIT_HEADER]: token }
    : {};
}
