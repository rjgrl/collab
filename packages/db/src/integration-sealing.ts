/**
 * Helper for sealing integration credentials into stored encrypted format.
 * Used by both credential-store (runtime) and seed-data (initialization).
 */
import {
  seal,
  keyFingerprint as getKeyFingerprint,
  credentialAad,
  type SealedValue,
} from "./secret-box";
import {
  INTEGRATION_CREDENTIAL_FIELDS,
  type IntegrationKey,
} from "@Alumni-Tracking-Ss/contracts/integration-credentials";

export interface SealedCredentialsResult {
  credentials: Record<string, SealedValue>;
  credentialHints: Record<string, string>;
  keyFingerprint: string;
}

/**
 * Seals credential values for storage in the database.
 * Hints are only generated for secret fields:
 * - For JSON fields: the last 4 characters of private_key_id (or "json" if not present)
 * - For other secret fields: the last 4 characters of the value if >= 12 chars, else "set"
 */
export function sealIntegrationCredentials(
  key: Buffer,
  integration: IntegrationKey,
  values: Record<string, string>,
): SealedCredentialsResult {
  const fields = INTEGRATION_CREDENTIAL_FIELDS[integration];
  const fieldMap = new Map(fields.map((f) => [f.name, f]));

  // For google_forms, add the server-generated webhookSecret field
  if (integration === "google_forms") {
    fieldMap.set("webhookSecret", {
      name: "webhookSecret",
      label: "Webhook Secret",
      secret: true,
      kind: "text" as const,
      required: false,
    });
  }

  const credentials: Record<string, SealedValue> = {};
  const credentialHints: Record<string, string> = {};

  for (const [fieldName, value] of Object.entries(values)) {
    if (value && value.trim()) {
      const field = fieldMap.get(fieldName);
      if (!field) continue;

      const aad = credentialAad(integration, fieldName);
      credentials[fieldName] = seal(key, aad, value);

      // Store hints only for secret fields
      if (field.secret) {
        if (field.kind === "json") {
          try {
            const parsed = JSON.parse(value);
            credentialHints[fieldName] = (parsed.private_key_id || "json").slice(-4);
          } catch {
            credentialHints[fieldName] = "json";
          }
        } else {
          // For non-JSON secrets, show last 4 chars only if value is >= 12 chars
          credentialHints[fieldName] = value.length >= 12 ? value.slice(-4) : "set";
        }
      }
    }
  }

  return {
    credentials,
    credentialHints,
    keyFingerprint: getKeyFingerprint(key),
  };
}
