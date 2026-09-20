import type { Context as ApiContext, IntegrationEnv } from "@Alumni-Tracking-Ss/api/context";
import { loadAuthUserFromToken } from "@Alumni-Tracking-Ss/api/server-utils";
import type { Context as HonoContext } from "hono";
import { getCookie } from "hono/cookie";

import { db } from "./services";

export const SESSION_COOKIE = "ats_session";

export type CreateContextOptions = {
  context: HonoContext;
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
    imgbbApiKey: envString("IMGBB_API_KEY"),
    imageHostProvider: envString("IMAGE_HOST_PROVIDER"),
    uploadDir: envString("UPLOAD_DIR") ?? "./uploads",
    appUrl: envString("APP_URL") ?? "http://localhost:3000",
  };
}

export function readSessionToken(c: HonoContext) {
  const header = c.req.header("authorization");
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  return getCookie(c, SESSION_COOKIE) ?? null;
}

export async function createContext(options: CreateContextOptions): Promise<ApiContext> {
  const token = readSessionToken(options.context);
  const user = await loadAuthUserFromToken(db, token);

  return {
    db,
    sessionToken: token,
    user,
    ipAddress: options.context.req.header("x-forwarded-for") ?? null,
    userAgent: options.context.req.header("user-agent") ?? null,
    integrationEnv: readIntegrationEnv(),
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
