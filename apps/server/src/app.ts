import { appRouter } from "@Alumni-Tracking-Ss/api/routers/index";
import {
  ALLOWED_EVIDENCE_TYPES,
  validateEvidence,
  readPrivateFile,
  MAX_EVIDENCE_BYTES,
  authenticateWithPassword,
  createSession,
  destroySession,
  importAlumniRows,
  isDatabaseUnavailable,
  isIntegrationEnabled,
  loadAuthUser,
  loadAuthUserFromToken,
  mapFormPayload,
  publicErrorMessage,
  registerUser,
  storeFile,
  upsertGoogleUser,
  verifyRecaptcha,
  writeAudit,
} from "@Alumni-Tracking-Ss/api/server-utils";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { rateLimiter } from "hono-rate-limiter";
import { getConnInfo } from "@hono/node-server/conninfo";
import { loginSchema, signupSchema } from "@Alumni-Tracking-Ss/api/validation";
import type { Database } from "@Alumni-Tracking-Ss/db";
import type { IntegrationEnv } from "@Alumni-Tracking-Ss/api/context";

import { withNotDeleted } from "@Alumni-Tracking-Ss/db";

import { SESSION_COOKIE, createContext, readSessionToken } from "./context";

export function createApp({
  db,
  config,
  integrationEnv,
}: {
  db: Database;
  config: { nodeEnv: string; origin: string };
  integrationEnv: IntegrationEnv;
}) {
  const app = new Hono();
  const isProduction = config.nodeEnv === "production";
  const readIntegrationEnv = () => integrationEnv;
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
    if (
      !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
      ((origin && origin !== config.origin) || c.req.header("sec-fetch-site") === "cross-site")
    )
      return c.json({ error: "Origin is not allowed." }, 403);
    await next();
  });
  const limiter = rateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    keyGenerator: (c) => {
      try {
        return getConnInfo(c).remote.address || "unknown";
      } catch {
        return "unknown";
      }
    },
  });
  for (const route of [
    "/api/auth/login",
    "/api/auth/signup",
    "/api/auth/google",
    "/api/auth/google/callback",
    "/rpc/auth/login",
    "/rpc/auth/signup",
    "/rpc/auth/changePassword",
  ])
    app.use(route, limiter);

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
    return loadAuthUserFromToken(db, readSessionToken(c));
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
    console.error("HTTP request failed", { name: err.name });
    const status = isDatabaseUnavailable(err) ? 503 : 500;
    return c.json(
      { error: isDatabaseUnavailable(err) ? publicErrorMessage(err) : "Request failed." },
      status,
    );
  });

  app.post("/api/auth/login", async (c) => {
    const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: "Enter a valid email and password (8-128 characters)." }, 400);
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
        ipAddress: c.req.header("x-forwarded-for"),
      });
      const session = await createSession(db, user.id, {
        ipAddress: c.req.header("x-forwarded-for"),
        userAgent: c.req.header("user-agent"),
      });
      setCookie(c, SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
      const authUser = await loadAuthUser(db, user.id);
      return c.json({ user: authUser });
    } catch (error) {
      if (isDatabaseUnavailable(error)) {
        return c.json({ error: publicErrorMessage(error) }, 503);
      }
      const message =
        error instanceof Error && error.name === "ORPCError" ? error.message : "Unable to sign in.";
      return c.json({ error: message }, 401);
    }
  });

  app.post("/api/auth/signup", async (c) => {
    const parsed = signupSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: "Enter a name, valid email and password (8-128 characters)." }, 400);
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
        name: body.name,
        email: body.email,
        password: body.password,
        ipAddress: c.req.header("x-forwarded-for"),
      });
      const session = await createSession(db, user.id, {
        ipAddress: c.req.header("x-forwarded-for"),
        userAgent: c.req.header("user-agent"),
      });
      setCookie(c, SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
      const authUser = await loadAuthUser(db, user.id);
      return c.json({ user: authUser });
    } catch (error) {
      const message =
        error instanceof Error && error.name === "ORPCError"
          ? error.message
          : "Unable to create account.";
      return c.json({ error: message }, 400);
    }
  });

  app.post("/api/auth/logout", async (c) => {
    const token = readSessionToken(c);
    await destroySession(db, token);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
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

    try {
      const user = await upsertGoogleUser(db, {
        email: profile.email,
        name: profile.name || profile.email,
        image: profile.picture,
      });
      const session = await createSession(db, user.id, {
        ipAddress: c.req.header("x-forwarded-for"),
        userAgent: c.req.header("user-agent"),
      });
      setCookie(c, SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
      await writeAudit(db, {
        actorId: user.id,
        action: "auth.google",
        entity: "user",
        entityId: user.id,
        summary: "Signed in with Google",
      });
      return c.redirect(`${config.origin}/dashboard`);
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
      where: withNotDeleted({ id: c.req.param("id") }),
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
    if (env.googleFormsWebhookSecret && secret !== env.googleFormsWebhookSecret) {
      return c.json({ error: "Invalid webhook secret." }, 401);
    }

    if (!env.googleFormsWebhookSecret && config.nodeEnv === "production") {
      return c.json({ error: "Webhook secret is required in production." }, 401);
    }

    const payload = (await c.req.json()) as Record<string, unknown>;
    try {
      const row = mapFormPayload(payload);
      const result = await importAlumniRows(db, [{ ...row, isTracked: true }]);
      await db.importJob.create({
        data: {
          source: "google_forms",
          status: result.errorCount > 0 ? "failed" : "completed",
          totalRows: result.totalRows,
          successCount: result.successCount,
          errorCount: result.errorCount,
          errors: result.errors,
          completedAt: new Date(),
        },
      });
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid form payload.";
      return c.json({ error: message }, 400);
    }
  });

  app.use("/*", async (c, next) => {
    const path = c.req.path;
    if (!path.startsWith("/rpc") && !path.startsWith("/api-reference")) {
      return next();
    }

    const context = await createContext({ context: c, db, integrationEnv });

    if (path.startsWith("/rpc")) {
      const rpcResult = await rpcHandler.handle(c.req.raw, {
        prefix: "/rpc",
        context,
      });

      if (rpcResult.matched) {
        return c.newResponse(rpcResult.response.body, rpcResult.response);
      }
    }

    if (path.startsWith("/api-reference")) {
      const apiResult = await apiHandler.handle(c.req.raw, {
        prefix: "/api-reference",
        context,
      });

      if (apiResult.matched) {
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
      await db.$runCommandRaw({ ping: 1 });
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false }, 503);
    }
  });

  return app;
}
