import type { IntegrationKey } from "@Alumni-Tracking-Ss/contracts/integration-credentials";
import { ApiError } from "../http-error";
import type { IntegrationEnv } from "../context";
import { googleAccessToken } from "./files";

export async function testIntegrationConnection(
  key: IntegrationKey,
  values: Record<string, string>,
  options: {
    env: IntegrationEnv;
    adminEmail: string;
    fetcher?: typeof fetch;
  },
): Promise<void> {
  const { env, adminEmail, fetcher = fetch } = options;

  // If a test hook is provided, use it instead
  if (env.connectionTester) {
    return env.connectionTester(key, values);
  }

  const timeout = AbortSignal.timeout(15000);

  switch (key) {
    case "recaptcha": {
      const secret = values.secretKey?.trim();
      if (!secret)
        throw new ApiError("BAD_REQUEST", {
          message: "Secret key is required for testing.",
        });

      try {
        const body = new URLSearchParams({
          secret,
          response: "connection-test",
        });

        const response = await fetcher("https://www.google.com/recaptcha/api/siteverify", {
          method: "POST",
          signal: timeout,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });

        if (!response.ok) {
          throw new ApiError("BAD_REQUEST", {
            message: "Google rejected the reCAPTCHA secret key.",
          });
        }

        const payload = (await response.json()) as { error_codes?: string[] };
        if (payload.error_codes?.includes("invalid-input-secret")) {
          throw new ApiError("BAD_REQUEST", {
            message: "Google rejected the reCAPTCHA secret key.",
          });
        }
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError("BAD_REQUEST", {
          message: "Could not reach the provider. Try again.",
        });
      }
      break;
    }

    case "google_auth": {
      const clientId = values.clientId?.trim();
      const clientSecret = values.clientSecret?.trim();
      if (!clientId || !clientSecret)
        throw new ApiError("BAD_REQUEST", {
          message: "Client ID and secret are required for testing.",
        });

      try {
        const body = new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code: "connection-test",
          redirect_uri: `${env.appUrl}/api/auth/google/callback`,
        });

        const response = await fetcher("https://oauth2.googleapis.com/token", {
          method: "POST",
          signal: timeout,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });

        const payload = (await response.json()) as { error?: string };
        // invalid_grant means the code is invalid but credentials are valid
        if (payload.error === "invalid_client") {
          throw new ApiError("BAD_REQUEST", {
            message: "Google rejected the client ID or secret.",
          });
        }
        // Invalid_grant is expected and means credentials are good
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError("BAD_REQUEST", {
          message: "Could not reach the provider. Try again.",
        });
      }
      break;
    }

    case "google_drive": {
      const json = values.serviceAccountJson?.trim();
      const folderId = values.folderId?.trim();
      if (!json || !folderId)
        throw new ApiError("BAD_REQUEST", {
          message: "Service account JSON and folder ID are required for testing.",
        });

      try {
        const token = await googleAccessToken(
          json,
          ["https://www.googleapis.com/auth/drive"],
          fetcher,
        );

        const driveUrl = new URL(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}`,
        );
        driveUrl.searchParams.set("fields", "id,mimeType");
        driveUrl.searchParams.set("supportsAllDrives", "true");

        const response = await fetcher(driveUrl.toString(), {
          method: "GET",
          signal: timeout,
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new ApiError("BAD_REQUEST", {
            message: "Google Drive could not open that folder with this service account.",
          });
        }

        const payload = (await response.json()) as { mimeType?: string };
        if (payload.mimeType !== "application/vnd.google-apps.folder") {
          throw new ApiError("BAD_REQUEST", {
            message: "Google Drive could not open that folder with this service account.",
          });
        }
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError("BAD_REQUEST", {
          message: "Could not reach the provider. Try again.",
        });
      }
      break;
    }

    case "google_sheets": {
      const account = values.account?.trim();
      const spreadsheetId = values.spreadsheetId?.trim();
      let json: string | undefined;

      if (!account || !spreadsheetId)
        throw new ApiError("BAD_REQUEST", {
          message: "Account and spreadsheet ID are required for testing.",
        });

      if (account === "own") {
        json = values.serviceAccountJson?.trim();
      } else if (account === "drive") {
        // Need to check if Drive is enabled and has readable credentials
        if (!env.googleServiceAccountJson) {
          throw new ApiError("BAD_REQUEST", {
            message: "Enable Google Drive first.",
          });
        }
        json = env.googleServiceAccountJson;
      }

      if (!json)
        throw new ApiError("BAD_REQUEST", {
          message: "Service account JSON is required for testing.",
        });

      try {
        const token = await googleAccessToken(
          json,
          ["https://www.googleapis.com/auth/spreadsheets.readonly"],
          fetcher,
        );

        const sheetsUrl = new URL(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`,
        );
        sheetsUrl.searchParams.set("fields", "spreadsheetId");

        const response = await fetcher(sheetsUrl.toString(), {
          method: "GET",
          signal: timeout,
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new ApiError("BAD_REQUEST", {
            message: "Google Sheets could not open that spreadsheet with this service account.",
          });
        }
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError("BAD_REQUEST", {
          message: "Could not reach the provider. Try again.",
        });
      }
      break;
    }

    case "email": {
      const gatewayUrl = values.gatewayUrl?.trim();
      const fromAddress = values.fromAddress?.trim();
      const apiKey = values.apiKey?.trim();

      if (!gatewayUrl || !fromAddress || !apiKey)
        throw new ApiError("BAD_REQUEST", {
          message: "Gateway URL, from address, and API key are required for testing.",
        });

      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        const response = await fetcher(gatewayUrl, {
          method: "POST",
          signal: timeout,
          headers,
          body: JSON.stringify({
            from: fromAddress,
            to: adminEmail,
            subject: "Alumni Tracking System email test",
            text: "Email delivery is connected.",
          }),
        });

        if (!response.ok) {
          throw new ApiError("BAD_REQUEST", {
            message: "The email gateway did not accept the test message.",
          });
        }
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError("BAD_REQUEST", {
          message: "Could not reach the provider. Try again.",
        });
      }
      break;
    }

    case "image_host": {
      const provider = values.provider?.trim();
      if (!provider)
        throw new ApiError("BAD_REQUEST", {
          message: "Provider is required.",
        });

      if (provider === "google_drive") {
        // Check if Google Drive is enabled with readable credentials
        if (!env.googleServiceAccountJson) {
          throw new ApiError("BAD_REQUEST", {
            message: "Enable Google Drive first.",
          });
        }
      } else if (provider === "imgbb") {
        // No network test for imgbb, just validate format
      }
      break;
    }

    case "google_forms": {
      // Google Forms is special: no network test, just generate secret
      break;
    }

    default: {
      const _exhaustive: never = key;
      void _exhaustive;
    }
  }
}
