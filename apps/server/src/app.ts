import { appRouter } from "@Alumni-Tracking-Ss/api/routers/index";
import { requiresMfa } from "@Alumni-Tracking-Ss/api/services/mfa-policy";
import {
  ALLOWED_EVIDENCE_TYPES,
  validateEvidence,
  readPrivateFile,
  MAX_EVIDENCE_BYTES,
  authenticateWithPassword,
  createSession,
  destroySession,
  isDatabaseUnavailable,
  isIntegrationEnabled,
  loadAuthUser,
  loadAuthUserFromToken,
  acceptFormsSubmission,
  publicErrorMessage,
  registerUser,
  storeFile,
  upsertGoogleUser,
  verifyRecaptcha,
  writeAudit,
} from "@Alumni-Tracking-Ss/api/server-utils";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { rateLimiter } from "hono-rate-limiter";
import { loginSchema, signupSchema } from "@Alumni-Tracking-Ss/api/validation";
import type { Database } from "@Alumni-Tracking-Ss/db";
import type { IntegrationEnv } from "@Alumni-Tracking-Ss/api/context";
import { ZodError } from "zod";
import { boundedSetting, consumeAuthAttempt } from "@Alumni-Tracking-Ss/api/services/throttle";
import type { MiddlewareHandler } from "hono";

import { withNotDeleted } from "@Alumni-Tracking-Ss/db";

import { SESSION_COOKIE, createContext, readSessionToken, readPeerAddress } from "./context";

export function createApp({
  db,
  config,
  integrationEnv,
}: {
  db: Database;
  config: { nodeEnv: string; origin: string; trustedProxyIps?: readonly string[] };
  integrationEnv: IntegrationEnv;
}) {
  const app = new Hono<{ Variables: { requestId: string } }>();
  const isProduction = config.nodeEnv === "production";
  const clientAddress = (c: Parameters<typeof readSessionToken>[0]) =>
    readPeerAddress(c, config.trustedProxyIps);
  const sessionCookie = isProduction ? "__Host-ats_session" : SESSION_COOKIE;
  const readIntegrationEnv = () => integrationEnv;
  app.use("*", async (c, next) => {
    const requestId = randomUUID();
    c.set("requestId", requestId);
    c.header("X-Request-ID", requestId);
    const start = performance.now();
    await next();
    if (isProduction || process.env.HTTP_LOGGING === "true")
      console.info(
        JSON.stringify({
          event: "http_request",
          requestId,
          method: c.req.method,
          status: c.res.status,
          category:
            c.res.status >= 500
              ? "server"
              : c.res.status === 429
                ? "throttled"
                : c.res.status === 401
                  ? "unauthenticated"
                  : c.res.status === 403
                    ? "forbidden"
                    : c.res.status >= 400
                      ? "request"
                      : "success",
          durationMs: Math.round((performance.now() - start) * 100) / 100,
        }),
      );
  });
  app.use("*", secureHeaders());
  app.use(
    "*",
    bodyLimit({
      maxSize: MAX_EVIDENCE_BYTES + 128 * 1024,
      onError: (c) => c.json({ error: "Request body is too large." }, 413),
    }),
  );
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    const origin = c.req.header("origin");
    const cookieMutation = Boolean(
      getCookie(c, SESSION_COOKIE) || getCookie(c, "__Host-ats_session"),
    );
    let trustedReferer = false;
    if (origin === undefined && cookieMutation) {
      try {
        trustedReferer = new URL(c.req.header("referer") ?? "").origin === config.origin;
      } catch {
        // Missing or malformed source headers cannot authorize a cookie mutation.
      }
    }
    if (
      !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
      ((origin !== undefined && origin !== config.origin) ||
        (cookieMutation && origin === undefined && !trustedReferer) ||
        c.req.header("sec-fetch-site") === "cross-site")
    )
      return c.json({ error: "Origin is not allowed." }, 403);
    await next();
  });
  const ipWindowMs = boundedSetting(process.env.AUTH_IP_WINDOW_SECONDS, 900, 86400) * 1000;
  const ipLimit = boundedSetting(process.env.AUTH_IP_LIMIT, 30, 1000);
  const peerAddress = (c: Parameters<typeof readSessionToken>[0]) => clientAddress(c) ?? "unknown";
  const memoryLimiter = rateLimiter({
    windowMs: boundedSetting(process.env.AUTH_IP_WINDOW_SECONDS, 900, 86400) * 1000,
    limit: boundedSetting(process.env.AUTH_IP_LIMIT, 30, 1000),
    keyGenerator: peerAddress,
  });
  if (process.env.AUTH_IP_STORE && !["mongodb", "memory"].includes(process.env.AUTH_IP_STORE))
    throw new Error("AUTH_IP_STORE must be mongodb or memory.");
  const limiter: MiddlewareHandler =
    (process.env.AUTH_IP_STORE || (isProduction ? "mongodb" : "memory")) === "mongodb"
      ? async (c, next) => {
          try {
            await consumeAuthAttempt(db, "auth-ip", peerAddress(c), ipLimit, ipWindowMs);
          } catch (error) {
            if (error instanceof ORPCError && error.code === "TOO_MANY_REQUESTS") {
              c.header(
                "Retry-After",
                String((error.data as { retryAfterSeconds: number }).retryAfterSeconds),
              );
              return c.json({ error: error.message }, 429);
            }
            throw error;
          }
          await next();
        }
      : memoryLimiter;
  // All transports share one budget; adding an alias must not reset the allowance.
  const limitedAuthActions = new Set([
    "login",
    "signup",
    "changePassword",
    "sendVerification",
    "confirmVerification",
    "createGooglePassword",
    "completeProfile",
    "beginMfa",
    "confirmMfa",
    "verifyMfa",
    "forgotPassword",
    "resetPassword",
    "google",
  ]);
  app.use("*", async (c, next) => {
    // oRPC accepts a trailing slash. Match decoded path segments rather than
    // registering only the exact spelling of each authentication endpoint.
    let segments: string[];
    try {
      segments = decodeURIComponent(c.req.path).split("/").filter(Boolean);
    } catch {
      return c.json({ error: "Invalid request path." }, 400);
    }
    if (
      ["api", "rpc", "api-reference"].includes(segments[0] ?? "") &&
      segments[1] === "auth" &&
      limitedAuthActions.has(segments[2] ?? "")
    )
      return limiter(c, next);
    await next();
  });

  app.use(
    "/*",
    cors({
      origin: config.origin,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  );

  function cookieOptions(expiresAt: Date) {
    return {
      httpOnly: true,
      path: "/",
      sameSite: "Lax" as const,
      secure: isProduction,
      expires: expiresAt,
    };
  }

  async function currentUser(c: Parameters<typeof readSessionToken>[0]) {
    const user = await loadAuthUserFromToken(db, readSessionToken(c));
    return user?.needsProfileCompletion || (user && requiresMfa(user) && !user.mfaVerified)
      ? null
      : user;
  }

  const apiHandler = new OpenAPIHandler(appRouter, {
    plugins: [
      new OpenAPIReferencePlugin({
        schemaConverters: [new ZodToJsonSchemaConverter()],
      }),
    ],
    interceptors: [
      onError((error) => {
        console.error("API request failed", {
          code:
            typeof error === "object" && error && "code" in error
              ? String(error.code)
              : "INTERNAL_SERVER_ERROR",
        });
      }),
    ],
  });

  const rpcHandler = new RPCHandler(appRouter, {
    interceptors: [
      onError(() => {
        console.error("API request failed");
      }),
    ],
  });

  app.onError((err, c) => {
    console.error("HTTP request failed", { name: err.name, requestId: c.get("requestId") });
    const status = isDatabaseUnavailable(err) ? 503 : 500;
    return c.json(
      { error: isDatabaseUnavailable(err) ? publicErrorMessage(err) : "Request failed." },
      status,
    );
  });

  app.post("/api/auth/login", async (c) => {
    const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Enter a valid email and password." }, 400);
    const body = parsed.data;

    try {
      const recaptchaEnabled = await isIntegrationEnabled(db, "recaptcha");
      if (recaptchaEnabled) {
        const ok = await verifyRecaptcha(readIntegrationEnv(), {
          token: body.recaptchaToken,
          fallback: body.recaptchaFallback,
        });
        if (!ok) {
          return c.json({ error: "Complete the reCAPTCHA check." }, 400);
        }
      }

      const user = await authenticateWithPassword(db, {
        email: body.email,
        password: body.password,
        ipAddress: clientAddress(c),
      });
      const session = await createSession(db, user.id, {
        ipAddress: clientAddress(c),
        userAgent: c.req.header("user-agent"),
      });
      setCookie(c, sessionCookie, session.token, cookieOptions(session.expiresAt));
      const authUser = await loadAuthUser(db, user.id);
      return c.json({ user: authUser });
    } catch (error) {
      if (isDatabaseUnavailable(error)) {
        return c.json({ error: publicErrorMessage(error) }, 503);
      }
      const message = error instanceof ORPCError ? error.message : "Unable to sign in.";
      if (error instanceof ORPCError && error.code === "TOO_MANY_REQUESTS") {
        const data = error.data as { retryAfterSeconds?: number } | undefined;
        c.header("Retry-After", String(data?.retryAfterSeconds ?? 900));
        return c.json({ error: message }, 429);
      }
      return c.json({ error: message }, 401);
    }
  });

  app.post("/api/auth/signup", async (c) => {
    const parsed = signupSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json(
        {
          error:
            "Enter your name, valid email, phone number, gender, optional Facebook link and password (15-128 characters).",
        },
        400,
      );
    const body = parsed.data;

    const recaptchaEnabled = await isIntegrationEnabled(db, "recaptcha");
    if (recaptchaEnabled) {
      const ok = await verifyRecaptcha(readIntegrationEnv(), {
        token: body.recaptchaToken,
        fallback: body.recaptchaFallback,
      });
      if (!ok) {
        return c.json({ error: "Complete the reCAPTCHA check." }, 400);
      }
    }

    try {
      const user = await registerUser(db, {
        ...body,
        ipAddress: clientAddress(c),
      });
      const session = await createSession(db, user.id, {
        ipAddress: clientAddress(c),
        userAgent: c.req.header("user-agent"),
      });
      setCookie(c, sessionCookie, session.token, cookieOptions(session.expiresAt));
      const authUser = await loadAuthUser(db, user.id);
      return c.json({ user: authUser });
    } catch (error) {
      const message = error instanceof ORPCError ? error.message : "Unable to create account.";
      return c.json(
        { error: message },
        error instanceof Error && "code" in error && error.code === "CONFLICT" ? 409 : 400,
      );
    }
  });

  app.post("/api/auth/logout", async (c) => {
    const token = readSessionToken(c);
    await destroySession(db, token);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    deleteCookie(c, "__Host-ats_session", { path: "/", secure: true });
    return c.json({ ok: true });
  });

  app.get("/api/auth/google", async (c) => {
    const env = readIntegrationEnv();
    const enabled = await isIntegrationEnabled(db, "google_auth");
    if (!enabled || !env.googleClientId || !env.googleClientSecret) {
      return c.json({ error: "Google sign-in is not configured." }, 400);
    }

    const state = randomBytes(32).toString("hex");
    setCookie(c, "ats_oauth_state", state, {
      ...cookieOptions(new Date(Date.now() + 600_000)),
      path: "/api/auth/google",
    });
    const params = new URLSearchParams({
      state,
      client_id: env.googleClientId,
      redirect_uri: `${env.appUrl}/api/auth/google/callback`,
      response_type: "code",
      scope: "openid email profile",
      prompt: "select_account",
      max_age: "0",
    });

    return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  app.get("/api/auth/google/callback", async (c) => {
    const expectedState = getCookie(c, "ats_oauth_state");
    const state = c.req.query("state");
    deleteCookie(c, "ats_oauth_state", { path: "/api/auth/google" });
    if (
      !expectedState ||
      !state ||
      !/^[a-f0-9]{64}$/.test(state) ||
      !/^[a-f0-9]{64}$/.test(expectedState) ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))
    )
      return c.redirect(config.origin + "/login?error=google");
    if (!(await isIntegrationEnabled(db, "google_auth")))
      return c.redirect(config.origin + "/login?error=google");
    const code = c.req.query("code");
    const env = readIntegrationEnv();
    if (!code || !env.googleClientId || !env.googleClientSecret) {
      return c.redirect(`${config.origin}/login?error=google`);
    }

    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.googleClientId,
          client_secret: env.googleClientSecret,
          redirect_uri: `${env.appUrl}/api/auth/google/callback`,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        return c.redirect(`${config.origin}/login?error=google`);
      }

      const tokens = (await tokenResponse.json()) as { access_token?: string };
      if (!tokens.access_token) {
        return c.redirect(`${config.origin}/login?error=google`);
      }

      const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!profileResponse.ok) return c.redirect(config.origin + "/login?error=google");
      const profile = (await profileResponse.json()) as {
        email?: string;
        name?: string;
        picture?: string;
        verified_email?: boolean;
      };

      if (!profile.email || profile.verified_email !== true) {
        return c.redirect(`${config.origin}/login?error=google`);
      }

      const user = await upsertGoogleUser(db, {
        email: profile.email,
        name: profile.name || profile.email,
        image: profile.picture,
      });
      const session = await createSession(db, user.id, {
        ipAddress: clientAddress(c),
        userAgent: c.req.header("user-agent"),
        googleVerifiedAt: new Date(),
      });
      setCookie(c, sessionCookie, session.token, cookieOptions(session.expiresAt));
      await writeAudit(db, {
        actorId: user.id,
        action: "auth.google",
        entity: "user",
        entityId: user.id,
        summary: "Signed in with Google",
      });
      return c.redirect(
        `${config.origin}${user.needsProfileCompletion || user.passwordHash === null || (user.verificationRequired && (!user.emailVerified || !user.phoneVerified)) ? "/complete-profile" : "/dashboard"}`,
      );
    } catch {
      return c.redirect(`${config.origin}/login?error=google`);
    }
  });

  app.post("/api/files/evidence", async (c) => {
    const user = await currentUser(c);
    if (!user || user.status !== "active") {
      return c.json({ error: "Sign in required." }, 401);
    }
    if (!user.permissions.includes("files.write")) {
      return c.json({ error: "Missing permission: files.write" }, 403);
    }

    const form = await c.req.formData();
    const alumniId = String(form.get("alumniId") ?? "");
    const trackingEventId = String(form.get("trackingEventId") ?? "");
    const kind = String(form.get("kind") ?? "evidence");
    const file = form.get("file");

    if (!alumniId || !(file instanceof File)) {
      return c.json({ error: "Alumni and file are required." }, 400);
    }

    if (!ALLOWED_EVIDENCE_TYPES.has(file.type)) {
      return c.json({ error: "That file type is not allowed." }, 400);
    }

    if (file.size > MAX_EVIDENCE_BYTES) {
      return c.json({ error: "File must be 10 MB or smaller." }, 400);
    }

    const alumni = await db.alumni.findFirst({ where: withNotDeleted({ id: alumniId }) });
    if (!alumni) {
      return c.json({ error: "Alumni record not found." }, 404);
    }

    if (!["image", "evidence"].includes(kind)) return c.json({ error: "Invalid file kind." }, 400);
    if (
      trackingEventId &&
      !(await db.trackingEvent.findFirst({ where: { id: trackingEventId, alumniId } }))
    )
      return c.json({ error: "Tracking event does not belong to this alumni record." }, 400);
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!(await validateEvidence(buffer, file.type)))
      return c.json({ error: "File contents do not match an allowed file type." }, 400);
    if (kind === "image" && !file.type.startsWith("image/"))
      return c.json({ error: "Choose a supported profile image." }, 400);
    const storageEnv = { ...readIntegrationEnv() };
    if (!(await isIntegrationEnabled(db, "google_drive")))
      storageEnv.googleServiceAccountJson = undefined;
    if (!(await isIntegrationEnabled(db, "image_host"))) storageEnv.imgbbApiKey = undefined;
    const stored = await storeFile(storageEnv, {
      buffer,
      mimeType: file.type,
      originalName: file.name,
      preferImageHost: kind === "image",
    });

    const evidence = await db.evidenceFile.create({
      data: {
        alumniId,
        trackingEventId: trackingEventId || undefined,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        provider: stored.provider,
        storageKey: stored.storageKey,
        url: stored.url,
        kind,
        createdById: user.id,
      },
    });

    if (kind === "image") {
      await db.alumni.update({
        where: { id: alumniId },
        data: { photoUrl: stored.provider === "imgbb" ? stored.url : `/api/files/${evidence.id}` },
      });
    }

    await writeAudit(db, {
      actorId: user.id,
      action: "files.upload",
      entity: "evidence",
      entityId: evidence.id,
      summary: `Uploaded ${file.name}`,
    });

    return c.json({
      id: evidence.id,
      originalName: evidence.originalName,
      mimeType: evidence.mimeType,
      sizeBytes: evidence.sizeBytes,
    });
  });

  app.get("/api/files/:id", async (c) => {
    const user = await currentUser(c);
    if (!user) {
      return c.json({ error: "Sign in required." }, 401);
    }
    if (!user.permissions.includes("files.read")) {
      return c.json({ error: "Missing permission: files.read" }, 403);
    }

    const evidence = await db.evidenceFile.findFirst({
      where: withNotDeleted({ id: c.req.param("id"), alumni: withNotDeleted() }),
    });
    if (!evidence) {
      return c.json({ error: "File not found." }, 404);
    }

    try {
      const data = await readPrivateFile(readIntegrationEnv(), evidence);
      const safeName =
        evidence.originalName.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 160) || "download";
      return c.body(data, 200, {
        "Content-Type": evidence.mimeType,
        "Content-Disposition": 'attachment; filename="' + safeName + '"',
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      });
    } catch {
      return c.json({ error: "File is unavailable." }, 404);
    }
  });

  app.post("/api/integrations/google-forms/webhook", async (c) => {
    const env = readIntegrationEnv();
    const enabled = await isIntegrationEnabled(db, "google_forms");
    if (!enabled) {
      return c.json({ error: "Google Forms integration is disabled." }, 403);
    }

    const secret = c.req.header("x-webhook-secret");
    if (
      env.googleFormsWebhookSecret &&
      (!secret ||
        Buffer.byteLength(secret) !== Buffer.byteLength(env.googleFormsWebhookSecret) ||
        !timingSafeEqual(Buffer.from(secret), Buffer.from(env.googleFormsWebhookSecret)))
    ) {
      return c.json({ error: "Invalid webhook secret." }, 401);
    }

    if (!env.googleFormsWebhookSecret) {
      return c.json({ error: "Webhook secret is required." }, 401);
    }

    try {
      const payload: unknown = await c.req.json();
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        return c.json({ error: "Invalid form payload." }, 400);
      const result = await acceptFormsSubmission(
        db,
        c.req.header("idempotency-key"),
        payload as Record<string, unknown>,
      );
      return c.json(result);
    } catch (error) {
      if (error instanceof ORPCError) {
        if (error.code === "BAD_REQUEST") return c.json({ error: error.message }, 400);
        if (error.code === "CONFLICT") return c.json({ error: error.message }, 409);
        if (error.code === "SERVICE_UNAVAILABLE") {
          c.header("Retry-After", "1");
          return c.json({ error: error.message }, 503);
        }
      }
      if (error instanceof ZodError || error instanceof SyntaxError)
        return c.json({ error: "Invalid form payload. Check the required fields." }, 400);
      return c.json(
        { error: "Unable to process form submission." },
        isDatabaseUnavailable(error) ? 503 : 500,
      );
    }
  });

  app.use("/*", async (c, next) => {
    const path = c.req.path;
    if (!path.startsWith("/rpc") && !path.startsWith("/api-reference")) {
      return next();
    }

    const context = await createContext({
      context: c,
      db,
      integrationEnv,
      secureCookies: isProduction,
      trustedProxyIps: config.trustedProxyIps,
    });

    if (path.startsWith("/rpc")) {
      const rpcResult = await rpcHandler.handle(c.req.raw, {
        prefix: "/rpc",
        context,
      });

      if (rpcResult.matched) {
        if (rpcResult.response.status === 429) c.header("Retry-After", "900");
        return c.newResponse(rpcResult.response.body, rpcResult.response);
      }
    }

    if (path.startsWith("/api-reference")) {
      const apiResult = await apiHandler.handle(c.req.raw, {
        prefix: "/api-reference",
        context,
      });

      if (apiResult.matched) {
        if (apiResult.response.status === 429) c.header("Retry-After", "900");
        return c.newResponse(apiResult.response.body, apiResult.response);
      }
    }

    return next();
  });

  app.get("/", (c) => {
    return c.text("OK");
  });

  app.get("/health/live", (c) => c.json({ ok: true }));
  app.get("/health/ready", async (c) => {
    try {
      const result = await db.$runCommandRaw({ hello: 1 });
      if (result.isWritablePrimary !== true) return c.json({ ok: false }, 503);
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false }, 503);
    }
  });

  return app;
}
