import type { Database } from "@Alumni-Tracking-Ss/db";
import { ApiError } from "../http-error";
import type { IntegrationEnv } from "../context";
import { readStoredCredentials, type StoredCredentialStatus } from "./credential-store";
import {
  INTEGRATION_CREDENTIAL_FIELDS,
  INTEGRATION_NAMES,
} from "@Alumni-Tracking-Ss/contracts/integration-credentials";

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

export type IntegrationField = {
  name: string;
  label: string;
  secret: boolean;
  set: boolean;
  hint: string | null;
  value: string | null;
};

export type IntegrationStatus = {
  key: IntegrationKey;
  enabled: boolean;
  configured: boolean;
  mode: "configured" | "fallback" | "disabled";
  summary: string;
  fields: IntegrationField[];
  credentialStatus: StoredCredentialStatus;
  credentialsUpdatedAt: Date | null;
  credentialsUpdatedBy: string | null;
};

export async function listIntegrations(
  db: Database,
  env: IntegrationEnv,
  options?: { keyBuffer?: Buffer },
): Promise<IntegrationStatus[]> {
  const rows = await db.IntegrationSetting.find({}).lean().exec();
  const rowByKey = new Map(rows.map((row) => [row.key, row]));
  const editorIds = [
    ...new Set(
      rows.flatMap((row) => (row.credentialsUpdatedBy ? [String(row.credentialsUpdatedBy)] : [])),
    ),
  ];
  const editors = editorIds.length
    ? await db.User.find({ _id: { $in: editorIds } })
        .select("_id name")
        .lean()
        .exec()
    : [];
  const editorName = new Map(editors.map((user) => [String(user._id), user.name]));

  return Promise.all(
    INTEGRATION_KEYS.map(async (key) => {
      const row = rowByKey.get(key);
      const enabled = row?.enabled ?? false;
      const configured = isConfigured(key, env);
      const mode: IntegrationStatus["mode"] = !enabled
        ? "disabled"
        : configured
          ? "configured"
          : "fallback";
      // Only non-secret values are ever decrypted for the response; secrets expose a hint.
      const stored = row
        ? await readStoredCredentials(row, options?.keyBuffer ?? null)
        : { status: "none" as const, values: {} as Record<string, string> };
      const fields = INTEGRATION_CREDENTIAL_FIELDS[key].map((field) => {
        const set = Boolean(
          (row?.credentials as Record<string, unknown> | undefined)?.[field.name],
        );
        return {
          name: field.name,
          label: field.label,
          secret: field.secret,
          set,
          hint:
            field.secret && set
              ? ((row?.credentialHints as Record<string, string> | undefined)?.[field.name] ?? null)
              : null,
          value: field.secret ? null : (stored.values[field.name] ?? null),
        };
      });
      return {
        key,
        enabled,
        configured,
        mode,
        summary: summarize(key, mode),
        fields,
        credentialStatus: stored.status,
        credentialsUpdatedAt: row?.credentialsUpdatedAt ?? null,
        credentialsUpdatedBy: row?.credentialsUpdatedBy
          ? (editorName.get(String(row.credentialsUpdatedBy)) ?? null)
          : null,
      };
    }),
  );
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
      return Boolean(
        (env.googleSheetsServiceAccountJson ?? env.googleServiceAccountJson) &&
        env.googleSheetsSpreadsheetId,
      );
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
    return "Connected; credentials were tested when they were saved";
  }

  return fallbacks[key];
}

export async function isIntegrationEnabled(db: Database, key: IntegrationKey) {
  const row = await db.IntegrationSetting.findOne({ key }).lean().exec();
  return row?.enabled ?? false;
}

export async function getIntegrationStatus(
  db: Database,
  key: IntegrationKey,
  env: IntegrationEnv,
  options?: { keyBuffer?: Buffer },
): Promise<IntegrationStatus> {
  const rows = await listIntegrations(db, env, options);
  const status = rows.find((s) => s.key === key);
  if (!status) throw new ApiError("INTERNAL_SERVER_ERROR");
  return status;
}

export async function requireIntegration(db: Database, key: IntegrationKey) {
  if (!(await isIntegrationEnabled(db, key)))
    throw new ApiError("FORBIDDEN", { message: "This integration is disabled." });
}

export { INTEGRATION_NAMES };
