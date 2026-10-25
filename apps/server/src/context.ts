import type { Request, Response } from "express";
import type { Context as ApiContext, IntegrationEnv } from "@Alumni-Tracking-Ss/api/context";
import {
  loadAuthUserFromToken,
  storedSessionToken,
} from "@Alumni-Tracking-Ss/api/services/session";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { resolveClientAddress } from "./runtime-config";

export const SESSION_COOKIE = "ats_session";
export function readPeerAddress(request: Request, trustedProxyIps: readonly string[] = []) {
  const forwarded = request.get("x-forwarded-for");
  return resolveClientAddress(request.socket.remoteAddress ?? null, forwarded, trustedProxyIps);
}

function envString(key: string) {
  const value = process.env[key];
  return value && value.trim().length > 0 ? value : undefined;
}

export function readIntegrationEnv(): IntegrationEnv {
  return {
    recaptchaSecretKey: envString("RECAPTCHA_SECRET_KEY"),
    recaptchaSiteKey: envString("RECAPTCHA_SITE_KEY"),
    googleClientId: envString("GOOGLE_CLIENT_ID"),
    googleClientSecret: envString("GOOGLE_CLIENT_SECRET"),
    googleServiceAccountJson: envString("GOOGLE_SERVICE_ACCOUNT_JSON"),
    googleDriveFolderId: envString("GOOGLE_DRIVE_FOLDER_ID"),
    googleSheetsSpreadsheetId: envString("GOOGLE_SHEETS_SPREADSHEET_ID"),
    googleFormsWebhookSecret: envString("GOOGLE_FORMS_WEBHOOK_SECRET"),
    smtpUrl: envString("SMTP_URL"),
    smtpFrom: envString("SMTP_FROM"),
    verificationSecret: envString("SESSION_SECRET"),
    mfaEncryptionKey: envString("MFA_ENCRYPTION_KEY"),
    imgbbApiKey: envString("IMGBB_API_KEY"),
    imageHostProvider: envString("IMAGE_HOST_PROVIDER"),
    uploadDir: envString("UPLOAD_DIR") ?? "./uploads",
    appUrl: envString("APP_URL") ?? "http://localhost:3000",
    webOrigin: envString("CORS_ORIGIN") ?? "http://localhost:3001",
  };
}

export function readSessionToken(request: Request) {
  const header = request.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7).trim() || null;
  const cookies: unknown = request.cookies;
  if (!cookies || typeof cookies !== "object") return null;
  const value =
    "__Host-ats_session" in cookies && typeof cookies["__Host-ats_session"] === "string"
      ? cookies["__Host-ats_session"]
      : "ats_session" in cookies
        ? cookies.ats_session
        : null;
  return typeof value === "string" ? value : null;
}

export function sessionCookieOptions(secureCookies: boolean, expiresAt: Date) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: secureCookies,
    expires: expiresAt,
  };
}

export async function createContext(options: {
  request: Request;
  response: Response;
  db: Database;
  integrationEnv: IntegrationEnv;
  secureCookies?: boolean;
  trustedProxyIps?: readonly string[];
  sessionLoader?: typeof loadAuthUserFromToken;
}): Promise<ApiContext> {
  const { request, response, db } = options;
  const token = readSessionToken(request);
  const user = await (options.sessionLoader ?? loadAuthUserFromToken)(db, token);
  return {
    db,
    sessionToken: token,
    sessionStorageToken: token ? storedSessionToken(token) : null,
    onSessionRotation: request.get("authorization")?.startsWith("Bearer ")
      ? undefined
      : (session) => {
          response.cookie(
            options.secureCookies ? "__Host-ats_session" : SESSION_COOKIE,
            session.token,
            sessionCookieOptions(Boolean(options.secureCookies), session.expiresAt),
          );
        },
    user,
    ipAddress: readPeerAddress(request, options.trustedProxyIps),
    userAgent: request.get("user-agent") ?? null,
    integrationEnv: options.integrationEnv,
  };
}
export type Context = ApiContext;
