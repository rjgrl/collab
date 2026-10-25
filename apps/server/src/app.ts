import express, { type RequestHandler } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import type { Database } from "@Alumni-Tracking-Ss/db";
import type { IntegrationEnv } from "@Alumni-Tracking-Ss/api/context";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { boundedSetting, consumeAuthAttempt } from "@Alumni-Tracking-Ss/api/services/throttle";
import { loadAuthUserFromToken } from "@Alumni-Tracking-Ss/api/services/session";
import { MAX_EVIDENCE_BYTES } from "@Alumni-Tracking-Ss/api/integrations/files";
import { createContext, readPeerAddress } from "./context";
import { setRequestContext } from "./middleware/request-context";
import { authenticate } from "./middleware/authenticate";
import { authorize } from "./middleware/authorize";
import { errorHandler } from "./middleware/error-handler";
import { authRoutes } from "./modules/auth/routes";
import { googleController } from "./modules/auth/google.controller";
import { usersRoutes } from "./modules/users/routes";
import { rolesRoutes } from "./modules/roles/routes";
import { permissionsController } from "./modules/roles/permissions.controller";
import { academicRoutes } from "./modules/academic/routes";
import { programsRoutes } from "./modules/programs/routes";
import { alumniRoutes } from "./modules/alumni/routes";
import { meProfileController, deleteEmploymentController } from "./modules/alumni/self.controller";
import { dashboardController } from "./modules/reports/dashboard.controller";
import { reportsRoutes } from "./modules/reports/routes";
import { integrationsRoutes } from "./modules/integrations/routes";
import { formsWebhookController } from "./modules/integrations/webhook.controller";
import { auditRoutes } from "./modules/audit/routes";
import { notificationsRoutes } from "./modules/notifications/routes";
import { filesRoutes, ownFilesRoutes } from "./modules/files/routes";
import { accountPhotoRoutes, ownPhotoRoutes } from "./modules/account-photos/routes";
import { employmentController } from "./modules/alumni/employment.controller";
import { aggregateController } from "./modules/reports/aggregate.controller";
import { smsConfigured } from "@Alumni-Tracking-Ss/api/integrations/sms";
import { isIntegrationEnabled } from "@Alumni-Tracking-Ss/api/integrations/registry";

export type AppOptions = {
  db: Database;
  config: { nodeEnv: string; origin: string; trustedProxyIps?: readonly string[] };
  integrationEnv: IntegrationEnv;
  sessionLoader?: typeof loadAuthUserFromToken;
};

export function createApp({ db, config, integrationEnv, sessionLoader }: AppOptions) {
  const app = express();
  const secureCookies = config.nodeEnv === "production";
  app.disable("x-powered-by");
  app.set("query parser", "simple");
  app.use((_request, response, next) => {
    const requestId = randomUUID();
    const start = performance.now();
    response.set({ "X-Request-ID": requestId, "Cache-Control": "no-store" });
    response.on("finish", () => {
      if (secureCookies || process.env.HTTP_LOGGING === "true")
        console.info(
          JSON.stringify({
            event: "http_request",
            requestId,
            method: _request.method,
            status: response.statusCode,
            category:
              response.statusCode >= 500
                ? "server"
                : response.statusCode === 429
                  ? "throttled"
                  : response.statusCode >= 400
                    ? "request"
                    : "success",
            durationMs: Math.round((performance.now() - start) * 100) / 100,
          }),
        );
    });
    next();
  });
  app.use(helmet());
  app.use(cookieParser());
  app.use((request, _response, next) => {
    const length = Number(request.get("content-length"));
    if (length > MAX_EVIDENCE_BYTES + 128 * 1024)
      throw new ApiError("PAYLOAD_TOO_LARGE", { message: "Request body is too large." });
    const origin = request.get("origin");
    const cookieHeader = request.get("cookie") ?? "";
    const cookieMutation = /(?:^|;\s*)(?:ats_session|__Host-ats_session)=/.test(cookieHeader);
    let trustedReferer = false;
    if (!origin && cookieMutation) {
      try {
        trustedReferer = new URL(request.get("referer") ?? "").origin === config.origin;
      } catch {
        /* Missing source cannot authorize a cookie mutation. */
      }
    }
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      ((origin !== undefined && origin !== config.origin) ||
        (cookieMutation && origin === undefined && !trustedReferer) ||
        request.get("sec-fetch-site") === "cross-site")
    )
      throw new ApiError("FORBIDDEN", { message: "Origin is not allowed." });
    next();
  });
  app.use(
    cors({
      origin: config.origin,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
  const windowMs = boundedSetting(process.env.AUTH_IP_WINDOW_SECONDS, 900, 86400) * 1000;
  const limit = boundedSetting(process.env.AUTH_IP_LIMIT, 30, 1000);
  const peer = (request: Parameters<typeof readPeerAddress>[0]) =>
    readPeerAddress(request, config.trustedProxyIps) ?? "unknown";
  const memoryLimiter = rateLimit({
    windowMs,
    limit,
    keyGenerator: (request) => ipKeyGenerator(peer(request)),
    handler: (_request, _response, next) =>
      next(
        new ApiError("TOO_MANY_REQUESTS", {
          message: "Too many authentication requests. Try again later.",
          data: { retryAfterSeconds: Math.ceil(windowMs / 1000) },
        }),
      ),
  });
  const store = process.env.AUTH_IP_STORE || (secureCookies ? "mongodb" : "memory");
  if (!["mongodb", "memory"].includes(store))
    throw new Error("AUTH_IP_STORE must be mongodb or memory.");
  const limiter: RequestHandler =
    store === "mongodb"
      ? async (request, _response, next) => {
          await consumeAuthAttempt(db, "auth-ip", peer(request), limit, windowMs);
          next();
        }
      : memoryLimiter;
  app.use((request, response, next) => {
    let path: string;
    try {
      path = decodeURIComponent(request.path).toLowerCase().replace(/\/+$/, "");
    } catch {
      throw new ApiError("BAD_REQUEST", { message: "Invalid request path." });
    }
    if (
      path.startsWith("/api/auth/") &&
      ((!["GET", "HEAD", "OPTIONS"].includes(request.method) && path !== "/api/auth/logout") ||
        path === "/api/auth/google")
    )
      return limiter(request, response, next);
    next();
  });
  app.use(express.json({ limit: "6mb", strict: true }));
  app.get("/", (_request, response) => {
    response.type("text").send("OK");
  });
  app.get("/health/live", (_request, response) => {
    response.json({ ok: true });
  });
  app.get("/health/ready", async (_request, response) => {
    try {
      await db.ready();
      const hello = await db.connection.db?.command({ hello: 1 });
      const ready = hello?.isWritablePrimary === true && typeof hello.setName === "string";
      const contactVerification =
        !secureCookies ||
        Boolean(
          (integrationEnv.verificationSecret?.length ?? 0) >= 32 &&
          integrationEnv.smtpUrl?.startsWith("https://") &&
          smsConfigured(integrationEnv) &&
          (await isIntegrationEnabled(db, "email")),
        );
      response.status(ready && contactVerification ? 200 : 503).json({
        ok: ready && contactVerification,
        checks: { database: ready, contactVerification },
      });
    } catch {
      response.status(503).json({ ok: false });
    }
  });
  app.use(async (request, response, next) => {
    setRequestContext(
      request,
      await createContext({
        request,
        response,
        db,
        integrationEnv,
        secureCookies,
        trustedProxyIps: config.trustedProxyIps,
        sessionLoader,
      }),
    );
    next();
  });
  const google = googleController(config.origin, secureCookies);
  app.get("/api/auth/google", google.start);
  app.get("/api/auth/google/callback", google.callback);
  app.use("/api/auth", authRoutes(secureCookies));
  app.use("/api/users", usersRoutes);
  app.use("/api/roles", rolesRoutes);
  app.get("/api/permissions", authenticate, authorize("permissions.read"), permissionsController);
  app.use("/api/departments", academicRoutes);
  app.use("/api/programs", programsRoutes);
  app.get("/api/me/profile", authenticate, authorize(undefined, false), meProfileController.get);
  app.patch(
    "/api/me/profile",
    authenticate,
    authorize(undefined, false),
    meProfileController.update,
  );
  app.use("/api/alumni", alumniRoutes);
  app.post(
    "/api/me/employments",
    authenticate,
    authorize(undefined, false),
    employmentController.createOwn,
  );
  app.get("/api/me/statistics", authenticate, authorize(undefined, false), aggregateController);
  app.patch(
    "/api/me/employments/:id",
    authenticate,
    authorize(undefined, false),
    employmentController.updateOwn,
  );
  app.delete(
    "/api/me/employments/:id",
    authenticate,
    authorize(undefined, false),
    employmentController.removeOwn,
  );
  app.patch(
    "/api/employments/:id",
    authenticate,
    authorize("alumni.write"),
    employmentController.update,
  );
  app.delete(
    "/api/employments/:id",
    authenticate,
    authorize("alumni.write"),
    deleteEmploymentController,
  );
  app.get("/api/dashboard", authenticate, authorize("dashboard.read"), dashboardController);
  app.use("/api/reports", reportsRoutes);
  app.post("/api/integrations/google-forms/webhook", formsWebhookController);
  app.use("/api/integrations", integrationsRoutes);
  app.use("/api/audit", auditRoutes);
  app.use("/api/notifications", notificationsRoutes);
  app.use("/api/files", filesRoutes);
  app.use("/api/me/files", ownFilesRoutes);
  app.use("/api/me/photo", ownPhotoRoutes);
  app.use("/api/account-photos", accountPhotoRoutes);
  app.use((_request, _response) => {
    throw new ApiError("NOT_FOUND", { message: "Endpoint not found." });
  });
  app.use(errorHandler);
  return app;
}
