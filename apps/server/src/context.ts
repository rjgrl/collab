import type { Context as ApiContext, IntegrationEnv } from "@Alumni-Tracking-Ss/api/context";
import { loadAuthUserFromToken } from "@Alumni-Tracking-Ss/api/server-utils";
import type { Context as HonoContext } from "hono";
import { getCookie, setCookie } from "hono/cookie";

import type { Database } from "@Alumni-Tracking-Ss/db";
import { storedSessionToken } from "@Alumni-Tracking-Ss/api/services/session";
import { getConnInfo } from "@hono/node-server/conninfo";
import { resolveClientAddress } from "./runtime-config";

export const SESSION_COOKIE = "ats_session";
export function readPeerAddress(c: HonoContext, trustedProxyIps: readonly string[] = []) {
  try {
    return resolveClientAddress(
      getConnInfo(c).remote.address ?? null,
      c.req.header("x-forwarded-for"),
      trustedProxyIps,
    );
  } catch {
    return null;
  }
}

export type CreateContextOptions = {
  context: HonoContext;
  db: Database;
  integrationEnv: IntegrationEnv;
  secureCookies?: boolean;
  trustedProxyIps?: readonly string[];
};

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

export function readSessionToken(c: HonoContext) {
  const header = c.req.header("authorization");
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  return getCookie(c, "__Host-ats_session") ?? getCookie(c, SESSION_COOKIE) ?? null;
}

export async function createContext(options: CreateContextOptions): Promise<ApiContext> {
  const { db } = options;
  const token = readSessionToken(options.context);
  const user = await loadAuthUserFromToken(db, token);

  return {
    db,
    sessionToken: token,
    sessionStorageToken: token ? storedSessionToken(token) : null,
    onSessionRotation: options.context.req.header("authorization")?.startsWith("Bearer ")
      ? undefined
      : (session) =>
          setCookie(
            options.context,
            options.secureCookies ? "__Host-ats_session" : SESSION_COOKIE,
            session.token,
            {
              httpOnly: true,
              path: "/",
              sameSite: "Lax",
              secure: Boolean(options.secureCookies),
              expires: session.expiresAt,
            },
          ),
    user,
    ipAddress: readPeerAddress(options.context, options.trustedProxyIps),
    userAgent: options.context.req.header("user-agent") ?? null,
    integrationEnv: options.integrationEnv,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
