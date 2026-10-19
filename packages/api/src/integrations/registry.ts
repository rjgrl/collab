import type { Database } from "@Alumni-Tracking-Ss/db";
import { ORPCError } from "@orpc/server";

import type { IntegrationEnv } from "../context";

export const INTEGRATION_KEYS = [
  "recaptcha",
  "google_auth",
  "google_drive",
  "email",
  "image_host",
  "google_forms",
  "google_sheets",
] as const;

export type IntegrationKey = (typeof INTEGRATION_KEYS)[number];

export type IntegrationStatus = {
  key: IntegrationKey;
  enabled: boolean;
  configured: boolean;
  mode: "configured" | "fallback" | "disabled";
  summary: string;
};

export async function listIntegrations(
  db: Database,
  env: IntegrationEnv,
): Promise<IntegrationStatus[]> {
  const rows = await db.integrationSetting.findMany();
  const enabledByKey = new Map(rows.map((row) => [row.key, row.enabled]));

  return INTEGRATION_KEYS.map((key) => {
    const enabled = enabledByKey.get(key) ?? key !== "google_forms";
    const configured = isConfigured(key, env);
    let mode: IntegrationStatus["mode"] = "fallback";
    if (!enabled) {
      mode = "disabled";
    } else if (configured) {
      mode = "configured";
    }

    return {
      key,
      enabled,
      configured,
      mode,
      summary: summarize(key, mode),
    };
  });
}

export function isConfigured(key: IntegrationKey, env: IntegrationEnv) {
  switch (key) {
    case "recaptcha":
      return Boolean(env.recaptchaSecretKey && env.recaptchaSiteKey);
    case "google_auth":
      return Boolean(env.googleClientId && env.googleClientSecret);
    case "google_drive":
      return Boolean(env.googleServiceAccountJson && env.googleDriveFolderId);
    case "email":
      return Boolean(env.smtpUrl?.startsWith("https://"));
    case "image_host":
      return Boolean(env.imgbbApiKey || env.googleServiceAccountJson);
    case "google_forms":
      return Boolean(env.googleFormsWebhookSecret);
    case "google_sheets":
      return Boolean(env.googleServiceAccountJson && env.googleSheetsSpreadsheetId);
    default:
      return false;
  }
}

function summarize(key: IntegrationKey, mode: IntegrationStatus["mode"]) {
  const fallbacks: Record<IntegrationKey, string> = {
    recaptcha: "Local checkbox on login/signup",
    google_auth: "Email and password sign-in only",
    google_drive: "Local disk evidence storage",
    email: "Email delivery is not configured",
    image_host: "Local disk image storage",
    google_forms: "Configure a shared webhook secret before enabling production imports",
    google_sheets: "CSV import and export",
  };

  if (mode === "disabled") {
    return "Turned off in Settings";
  }

  if (mode === "configured") {
    return "Configuration present; connection has not been verified";
  }

  return fallbacks[key];
}

export async function isIntegrationEnabled(db: Database, key: IntegrationKey) {
  const row = await db.integrationSetting.findUnique({ where: { key } });
  return row?.enabled ?? key !== "google_forms";
}

export async function requireIntegration(db: Database, key: IntegrationKey) {
  if (!(await isIntegrationEnabled(db, key)))
    throw new ORPCError("FORBIDDEN", { message: "This integration is disabled." });
}
