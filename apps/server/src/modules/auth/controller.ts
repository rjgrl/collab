import type { RequestHandler } from "express";
import { authSchemas, sessionResultSchema } from "@Alumni-Tracking-Ss/contracts/auth";
import { controller } from "../../middleware/controller";
import { requestContext } from "../../middleware/request-context";
import { validatedInput } from "../../middleware/validate";
import { SESSION_COOKIE, sessionCookieOptions } from "../../context";
import { authService } from "./service";

export function authController(secureCookies: boolean) {
  const login: RequestHandler = async (request, response) => {
    const input = validatedInput(request, authSchemas.login.input, "body");
    const session = sessionResultSchema.parse(
      await authService.login(requestContext(request), input),
    );
    response.cookie(
      secureCookies ? "__Host-ats_session" : SESSION_COOKIE,
      session.sessionToken,
      sessionCookieOptions(secureCookies, new Date(session.expiresAt)),
    );
    response.json(authSchemas.login.output.parse({ user: session.user }));
  };
  const signup: RequestHandler = async (request, response) => {
    const input = validatedInput(request, authSchemas.signup.input, "body");
    const session = sessionResultSchema.parse(
      await authService.signup(requestContext(request), input),
    );
    response.cookie(
      secureCookies ? "__Host-ats_session" : SESSION_COOKIE,
      session.sessionToken,
      sessionCookieOptions(secureCookies, new Date(session.expiresAt)),
    );
    response.status(201).json(authSchemas.signup.output.parse({ user: session.user }));
  };
  const logout: RequestHandler = async (request, response) => {
    const result = await authService.logout(
      requestContext(request),
      authSchemas.logout.input.parse(request.body),
    );
    response.clearCookie(SESSION_COOKIE, { path: "/", httpOnly: true, sameSite: "lax" });
    response.clearCookie("__Host-ats_session", {
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "lax",
    });
    response.json(authSchemas.logout.output.parse(result));
  };
  return {
    login,
    signup,
    logout,
    config: controller(authSchemas.config, authService.config, "none"),
    registrationPrograms: controller(
      authSchemas.registrationPrograms,
      authService.registrationPrograms,
      "query",
    ),
    me: controller(authSchemas.me, authService.me, "none"),
    forgotPassword: controller(authSchemas.forgotPassword, authService.forgotPassword, "body"),
    resetPassword: controller(authSchemas.resetPassword, authService.resetPassword, "body"),
    mfaStatus: controller(authSchemas.mfaStatus, authService.mfaStatus, "none"),
    beginMfa: controller(authSchemas.beginMfa, authService.beginMfa, "body"),
    confirmMfa: controller(authSchemas.confirmMfa, authService.confirmMfa, "body"),
    verifyMfa: controller(authSchemas.verifyMfa, authService.verifyMfa, "body"),
    verificationStatus: controller(
      authSchemas.verificationStatus,
      authService.verificationStatus,
      "none",
    ),
    sendVerification: controller(
      authSchemas.sendVerification,
      authService.sendVerification,
      "body",
    ),
    confirmVerification: controller(
      authSchemas.confirmVerification,
      authService.confirmVerification,
      "body",
    ),
    createGooglePassword: controller(
      authSchemas.createGooglePassword,
      authService.createGooglePassword,
      "body",
    ),
    completeProfile: controller(authSchemas.completeProfile, authService.completeProfile, "body"),
    updateProfile: controller(authSchemas.updateProfile, authService.updateProfile, "body"),
    changePassword: controller(authSchemas.changePassword, authService.changePassword, "body"),
  };
}
