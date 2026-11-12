import type { Database } from "@Alumni-Tracking-Ss/db";
import type { Types } from "mongoose";
import {
  open,
  keyFingerprint as getKeyFingerprint,
  parseSecretKey,
  credentialAad,
  type SealedValue,
} from "@Alumni-Tracking-Ss/db/secret-box";
import { sealIntegrationCredentials } from "@Alumni-Tracking-Ss/db/integration-sealing";
import type { IntegrationKey } from "@Alumni-Tracking-Ss/contracts/integration-credentials";
import { integrationKeySchema } from "@Alumni-Tracking-Ss/contracts/integrations";
import type { IntegrationEnv } from "../context";

export function integrationKey(env: IntegrationEnv): Buffer | null {
  try {
    return env.integrationEncryptionKey
      ? parseSecretKey(env.integrationEncryptionKey, "INTEGRATION_ENCRYPTION_KEY")
      : null;
  } catch {
    return null;
  }
}

export type StoredCredentialStatus = "none" | "ok" | "no_key" | "mismatch" | "unreadable";
export type StoredCredentials = {
  status: StoredCredentialStatus;
  values: Record<string, string>;
};

export async function readStoredCredentials(
  row: any,
  key: Buffer | null,
): Promise<StoredCredentials> {
  if (!row.credentials) return { status: "none", values: {} };
  if (!key) return { status: "no_key", values: {} };

  if (row.keyFingerprint !== getKeyFingerprint(key)) {
    return { status: "mismatch", values: {} };
  }

  const values: Record<string, string> = {};
  try {
    for (const [fieldName, sealed] of Object.entries(row.credentials)) {
      const aad = credentialAad(row.key, fieldName);
      const plaintext = open(key, aad, sealed as SealedValue);
      values[fieldName] = plaintext;
    }
    return { status: "ok", values };
  } catch {
    // Never log the value or error details
    return { status: "unreadable", values: {} };
  }
}

export async function storeCredentials(
  tx: Database,
  options: {
    integration: IntegrationKey;
    values: Record<string, string>;
    key: Buffer;
    actorId?: Types.ObjectId | null;
    enabled?: boolean;
  },
): Promise<any> {
  const { integration, values, key, actorId, enabled } = options;
  const sealed = sealIntegrationCredentials(key, integration, values);

  const now = new Date();
  const update = {
    $set: {
      credentials: sealed.credentials,
      credentialHints: sealed.credentialHints,
      keyFingerprint: sealed.keyFingerprint,
      credentialsUpdatedAt: now,
      ...(actorId ? { credentialsUpdatedBy: actorId } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
    },
  };

  return tx.IntegrationSetting.findOneAndUpdate({ key: integration }, update, {
    upsert: true,
    returnDocument: "after",
  }).exec();
}

export async function eraseCredentials(
  tx: Database,
  integration: IntegrationKey,
  actorId?: Types.ObjectId | null,
): Promise<any> {
  const now = new Date();
  return tx.IntegrationSetting.findOneAndUpdate(
    { key: integration },
    {
      $set: {
        enabled: false,
        credentialsUpdatedAt: now,
        ...(actorId ? { credentialsUpdatedBy: actorId } : {}),
      },
      $unset: { credentials: "", credentialHints: "", keyFingerprint: "" },
    },
    { upsert: true, returnDocument: "after" },
  ).exec();
}

export function withoutIntegrationCredentials(env: IntegrationEnv): IntegrationEnv {
  const credentialFields = [
    "recaptchaSiteKey",
    "recaptchaSecretKey",
    "googleClientId",
    "googleClientSecret",
    "googleServiceAccountJson",
    "googleDriveFolderId",
    "googleSheetsSpreadsheetId",
    "googleSheetsServiceAccountJson",
    "googleFormsWebhookSecret",
    "smtpUrl",
    "smtpFrom",
    "emailApiKey",
    "imgbbApiKey",
    "imageHostProvider",
  ];

  const result: IntegrationEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (!credentialFields.includes(key)) {
      (result as any)[key] = value;
    }
  }
  return result;
}

const envCache = new Map<IntegrationEnv, { env: IntegrationEnv; expiresAt: number }>();

export function invalidateIntegrationEnvCache(): void {
  envCache.clear();
}

export async function resolveIntegrationEnv(
  db: Database,
  base: IntegrationEnv,
  options: { production?: boolean },
): Promise<IntegrationEnv> {
  const now = Date.now();
  const cached = envCache.get(base);
  if (cached && cached.expiresAt > now) {
    return cached.env;
  }

  try {
    const key = integrationKey(base);
    const env = options.production ? withoutIntegrationCredentials(base) : { ...base };

    const rows = await db.IntegrationSetting.find({}).lean().exec();
    const INTEGRATION_KEYS = integrationKeySchema.options;

    for (const integrationKey of INTEGRATION_KEYS) {
      const row = rows.find((r: any) => r.key === integrationKey);
      if (!row) continue;

      const stored = await readStoredCredentials(row, key);
      if (stored.status !== "ok") continue;

      // Map stored credentials to env fields
      switch (integrationKey) {
        case "recaptcha":
          if (stored.values.siteKey) env.recaptchaSiteKey = stored.values.siteKey;
          if (stored.values.secretKey) env.recaptchaSecretKey = stored.values.secretKey;
          break;
        case "google_auth":
          if (stored.values.clientId) env.googleClientId = stored.values.clientId;
          if (stored.values.clientSecret) env.googleClientSecret = stored.values.clientSecret;
          break;
        case "google_drive":
          if (stored.values.serviceAccountJson)
            env.googleServiceAccountJson = stored.values.serviceAccountJson;
          if (stored.values.folderId) env.googleDriveFolderId = stored.values.folderId;
          break;
        case "google_sheets":
          if (stored.values.spreadsheetId)
            env.googleSheetsSpreadsheetId = stored.values.spreadsheetId;
          if (stored.values.account === "drive" && env.googleServiceAccountJson) {
            env.googleSheetsServiceAccountJson = env.googleServiceAccountJson;
          } else if (stored.values.serviceAccountJson) {
            env.googleSheetsServiceAccountJson = stored.values.serviceAccountJson;
          }
          break;
        case "image_host":
          if (stored.values.provider) env.imageHostProvider = stored.values.provider;
          if (stored.values.apiKey) env.imgbbApiKey = stored.values.apiKey;
          break;
        case "email":
          if (stored.values.gatewayUrl) env.smtpUrl = stored.values.gatewayUrl;
          if (stored.values.fromAddress) env.smtpFrom = stored.values.fromAddress;
          if (stored.values.apiKey) env.emailApiKey = stored.values.apiKey;
          break;
        case "google_forms":
          if (stored.values.webhookSecret)
            env.googleFormsWebhookSecret = stored.values.webhookSecret;
          break;
      }
    }

    const result = env;
    envCache.set(base, { env: result, expiresAt: now + 5000 });
    return result;
  } catch {
    // If DB read fails, return the starting env
    return options.production ? withoutIntegrationCredentials(base) : base;
  }
}
