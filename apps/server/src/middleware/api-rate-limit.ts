import type { RequestHandler } from "express";
import { createHash } from "node:crypto";
import { ipKeyGenerator } from "express-rate-limit";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { boundedSetting, consumeAuthAttempt } from "@Alumni-Tracking-Ss/api/services/throttle";
import { readPeerAddress } from "../context";
import { requestContext } from "./request-context";

/** Two layers: a shared-IP abuse ceiling before authentication, then a user/anonymous budget. */
export function apiRateLimits(
  db: Database,
  nodeEnv?: string,
  trustedProxyIps: readonly string[] = [],
) {
  const limit = boundedSetting(process.env.API_RATE_LIMIT, 300, 10000);
  const ipLimit = boundedSetting(process.env.API_IP_RATE_LIMIT, 3000, 100000);
  const store = process.env.API_RATE_STORE ?? "mongodb";
  if (!["mongodb", "memory"].includes(store) || (nodeEnv === "production" && store !== "mongodb"))
    throw new Error("API_RATE_STORE must be mongodb in production.");
  const buckets = new Map<string, { count: number; reset: number }>();
  async function consume(scope: string, identity: string, budget: number) {
    if (store === "mongodb") return consumeAuthAttempt(db, scope, identity, budget, 60000);
    const now = Date.now();
    // Bound memory by expiring old buckets on each request (development/test only).
    for (const [key, value] of buckets) if (value.reset <= now) buckets.delete(key);
    const key = `${scope}:${createHash("sha256").update(identity).digest("hex")}`;
    const bucket = buckets.get(key) ?? { count: 0, reset: (Math.floor(now / 60000) + 1) * 60000 };
    bucket.count++;
    buckets.set(key, bucket);
    if (bucket.count > budget)
      throw new ApiError("TOO_MANY_REQUESTS", {
        message: "Too many API requests. Please wait before trying again.",
        data: { retryAfterSeconds: Math.max(1, Math.ceil((bucket.reset - now) / 1000)) },
      });
  }
  const isApi = (path: string) => /^\/api(?:\/|$)/i.test(path);
  // Group IPv6 clients by subnet as well as normalizing IPv4 to prevent trivial address rotation.
  const ip = (request: Parameters<RequestHandler>[0]) =>
    ipKeyGenerator(readPeerAddress(request, trustedProxyIps) ?? "unknown");
  const ceiling: RequestHandler = async (request, _response, next) => {
    if (isApi(request.path)) await consume("api-ip-ceiling", ip(request), ipLimit);
    next();
  };
  const identity: RequestHandler = async (request, _response, next) => {
    if (isApi(request.path)) {
      const user = requestContext(request).user;
      await consume(user ? "api-user" : "api-anonymous", user?.id ?? ip(request), limit);
    }
    next();
  };
  return { ceiling, identity };
}
