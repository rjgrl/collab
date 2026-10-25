import type { RequestHandler } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { isIntegrationEnabled } from "@Alumni-Tracking-Ss/api/integrations/registry";
import { createSession, upsertGoogleUser } from "@Alumni-Tracking-Ss/api/services/session";
import { writeAudit } from "@Alumni-Tracking-Ss/api/audit";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { requestContext } from "../../middleware/request-context";
import { SESSION_COOKIE, sessionCookieOptions } from "../../context";

export function googleController(origin: string, secureCookies: boolean) {
  const start: RequestHandler = async (request, response) => {
    const { db, integrationEnv: env } = requestContext(request);
    if (
      !(await isIntegrationEnabled(db, "google_auth")) ||
      !env.googleClientId ||
      !env.googleClientSecret
    )
      throw new ApiError("BAD_REQUEST", { message: "Google sign-in is not configured." });
    const state = randomBytes(32).toString("hex");
    response.cookie("ats_oauth_state", state, {
      ...sessionCookieOptions(secureCookies, new Date(Date.now() + 600000)),
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
    response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  };
  const callback: RequestHandler = async (request, response) => {
    const { db, integrationEnv: env, ipAddress, userAgent } = requestContext(request);
    const cookies: unknown = request.cookies;
    const expected: unknown =
      cookies && typeof cookies === "object" && "ats_oauth_state" in cookies
        ? cookies.ats_oauth_state
        : undefined;
    const state = request.query.state;
    response.clearCookie("ats_oauth_state", {
      path: "/api/auth/google",
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookies,
    });
    const fail = () => {
      response.redirect(`${origin}/login?error=google`);
    };
    if (
      typeof expected !== "string" ||
      typeof state !== "string" ||
      !/^[a-f0-9]{64}$/.test(state) ||
      !/^[a-f0-9]{64}$/.test(expected) ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(expected))
    )
      return fail();
    const code = request.query.code;
    if (
      typeof code !== "string" ||
      !env.googleClientId ||
      !env.googleClientSecret ||
      !(await isIntegrationEnabled(db, "google_auth"))
    )
      return fail();
    try {
      const result = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.googleClientId,
          client_secret: env.googleClientSecret,
          redirect_uri: `${env.appUrl}/api/auth/google/callback`,
          grant_type: "authorization_code",
        }),
      });
      if (!result.ok) return fail();
      const tokens = z.object({ access_token: z.string().min(1) }).parse(await result.json());
      const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!profileResponse.ok) return fail();
      const profile = z
        .object({
          email: z.string().email(),
          name: z.string().optional(),
          picture: z.string().url().optional(),
          verified_email: z.literal(true),
        })
        .parse(await profileResponse.json());
      const user = await upsertGoogleUser(db, {
        email: profile.email,
        name: profile.name || profile.email,
        image: profile.picture,
      });
      const session = await createSession(db, user.id, {
        ipAddress,
        userAgent,
        googleVerifiedAt: new Date(),
      });
      response.cookie(
        secureCookies ? "__Host-ats_session" : SESSION_COOKIE,
        session.token,
        sessionCookieOptions(secureCookies, session.expiresAt),
      );
      await writeAudit(db, {
        actor: user,
        action: "auth.google",
        entity: "user",
        entityId: user.id,
        summary: "Signed in with Google",
      });
      response.redirect(
        `${origin}${user.needsProfileCompletion || !user.passwordHash || (user.verificationRequired && (!user.emailVerified || !user.phoneVerified)) ? "/complete-profile" : "/dashboard"}`,
      );
    } catch {
      fail();
    }
  };
  return { start, callback };
}
