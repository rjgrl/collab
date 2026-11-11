import type { IntegrationKey } from "@Alumni-Tracking-Ss/contracts/integration-credentials";
import { ApiError } from "../http-error";
import type { IntegrationEnv } from "../context";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { googleAccessToken } from "./files";

/** True for loopback, private, link-local, CGNAT, multicast and unspecified addresses. */
export function isPrivateAddress(address: string) {
  const v4 = address.startsWith("::ffff:") ? address.slice(7) : address;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = address.toLowerCase();
  return (
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe8") ||
    v6.startsWith("fe9") ||
    v6.startsWith("fea") ||
    v6.startsWith("feb") ||
    v6.startsWith("ff")
  );
}

/** Production gateways must be public: an administrator cannot point the server at internal hosts. */
async function assertPublicHost(url: string) {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true }).catch(() => [])).map((item) => item.address);
  if (!addresses.length || addresses.some(isPrivateAddress))
    throw new ApiError("BAD_REQUEST", {
      message: "The email gateway must be a public HTTPS address.",
    });
}

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
      // reCAPTCHA v2/v3 site keys are 40 characters beginning with "6L".
      if (!/^6L[0-9A-Za-z_-]{38}$/.test(values.siteKey?.trim() ?? ""))
        throw new ApiError("BAD_REQUEST", {
          message: "That does not look like a reCAPTCHA site key.",
        });
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

        // Google's field is "error-codes" (hyphen). With a valid secret and a dummy token Google
        // answers invalid-input-response; an unknown secret gives invalid-input-secret.
        const payload = (await response.json()) as { success?: boolean; "error-codes"?: unknown };
        const codes = Array.isArray(payload["error-codes"]) ? payload["error-codes"] : [];
        if (
          payload.success !== true &&
          !(codes.includes("invalid-input-response") && !codes.includes("invalid-input-secret"))
        ) {
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
        // Google authenticates the client before the code, so a dummy code yields invalid_grant
        // only when the client ID and secret are correct. Anything else is a rejection.
        if (payload.error !== "invalid_grant") {
          throw new ApiError("BAD_REQUEST", {
            message: "Google rejected the client ID or secret.",
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

      if (process.env.NODE_ENV === "production") await assertPublicHost(gatewayUrl);
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
        const apiKey = values.apiKey?.trim();
        if (!apiKey)
          throw new ApiError("BAD_REQUEST", { message: "ImgBB API key is required for testing." });
        try {
          // Uploads a 1x1 transparent PNG that ImgBB deletes after 60 seconds.
          const body = new URLSearchParams({
            image:
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
            name: "connection-test",
          });
          const url = new URL("https://api.imgbb.com/1/upload");
          url.searchParams.set("key", apiKey);
          url.searchParams.set("expiration", "60");
          const response = await fetcher(url.toString(), { method: "POST", signal: timeout, body });
          const payload = (await response.json().catch(() => null)) as { success?: boolean } | null;
          if (!response.ok || payload?.success !== true)
            throw new ApiError("BAD_REQUEST", { message: "ImgBB rejected the API key." });
        } catch (error) {
          if (error instanceof ApiError) throw error;
          throw new ApiError("BAD_REQUEST", {
            message: "Could not reach the provider. Try again.",
          });
        }
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
