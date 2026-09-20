import { appRouter } from "@Alumni-Tracking-Ss/api/routers/index";
import {
  ALLOWED_EVIDENCE_TYPES,
  MAX_EVIDENCE_BYTES,
  authenticateWithPassword,
  createSession,
  destroySession,
  importAlumniRows,
  isIntegrationEnabled,
  loadAuthUser,
  loadAuthUserFromToken,
  mapFormPayload,
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
import { deleteCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { withNotDeleted } from "@Alumni-Tracking-Ss/db";

import { SESSION_COOKIE, createContext, readIntegrationEnv, readSessionToken } from "./context";
import { ENV } from "./env.server";
import { db } from "./services";

const app = new Hono();
const isProduction = ENV.NODE_ENV === "production";

app.use(logger());
app.use(
  "/*",
  cors({
    origin: ENV.CORS_ORIGIN,
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

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.post("/api/auth/login", async (c) => {
  const body = await c.req.json<{
    email?: string;
    password?: string;
    recaptchaToken?: string;
    recaptchaFallback?: boolean;
  }>();

  if (!body.email || !body.password) {
    return c.json({ error: "Email and password are required." }, 400);
  }

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
    const message = error instanceof Error ? error.message : "Unable to sign in.";
    return c.json({ error: message }, 401);
  }
});

app.post("/api/auth/signup", async (c) => {
  const body = await c.req.json<{
    name?: string;
    email?: string;
    password?: string;
    recaptchaToken?: string;
    recaptchaFallback?: boolean;
  }>();

  if (!body.name || !body.email || !body.password) {
    return c.json({ error: "Name, email, and password are required." }, 400);
  }

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
    const message = error instanceof Error ? error.message : "Unable to create account.";
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

  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: `${env.appUrl}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
  });

  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get("/api/auth/google/callback", async (c) => {
  const code = c.req.query("code");
  const env = readIntegrationEnv();
  if (!code || !env.googleClientId || !env.googleClientSecret) {
    return c.redirect(`${ENV.CORS_ORIGIN}/login?error=google`);
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
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
    return c.redirect(`${ENV.CORS_ORIGIN}/login?error=google`);
  }

  const tokens = (await tokenResponse.json()) as { access_token?: string };
  if (!tokens.access_token) {
    return c.redirect(`${ENV.CORS_ORIGIN}/login?error=google`);
  }

  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = (await profileResponse.json()) as {
    email?: string;
    name?: string;
    picture?: string;
  };

  if (!profile.email) {
    return c.redirect(`${ENV.CORS_ORIGIN}/login?error=google`);
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
    return c.redirect(`${ENV.CORS_ORIGIN}/dashboard`);
  } catch {
    return c.redirect(`${ENV.CORS_ORIGIN}/login?error=google`);
  }
});

app.post("/api/files/evidence", async (c) => {
  const user = await currentUser(c);
  if (!user) {
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

  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await storeFile(readIntegrationEnv(), {
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

  if (kind === "image" && stored.url) {
    await db.alumni.update({
      where: { id: alumniId },
      data: { photoUrl: stored.url },
    });
  }

  await writeAudit(db, {
    actorId: user.id,
    action: "files.upload",
    entity: "evidence",
    entityId: evidence.id,
    summary: `Uploaded ${file.name}`,
  });

  return c.json(evidence);
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

  if (evidence.url) {
    return c.redirect(evidence.url);
  }

  if (evidence.provider !== "local") {
    return c.json({ error: "Remote file URL is unavailable." }, 404);
  }

  const uploadDir = readIntegrationEnv().uploadDir || path.join(process.cwd(), "uploads");
  const filePath = path.join(uploadDir, evidence.storageKey);
  const data = await readFile(filePath);
  return c.body(data, 200, {
    "Content-Type": evidence.mimeType,
    "Content-Disposition": `inline; filename="${evidence.originalName}"`,
  });
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

  if (!env.googleFormsWebhookSecret && ENV.NODE_ENV === "production") {
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
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

app.get("/", (c) => {
  return c.text("OK");
});

import { serve } from "@hono/node-server";

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
