import type { IntegrationKey } from "@Alumni-Tracking-Ss/contracts/integration-credentials";
import { ApiError } from "../http-error";
import type { IntegrationEnv } from "../context";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { googleAccessToken } from "./files";

function privateIPv4(address: string) {
  const [a, b, c] = address.split(".").map(Number) as [number, number, number];
  return (
    a === 0 || // "this network"
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, including cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF protocol, documentation
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // multicast and reserved
  );
}

/** The 16 bytes of an IPv6 address (with an optional dotted IPv4 tail), or null if malformed. */
function ipv6Bytes(address: string): number[] | null {
  let text = address.toLowerCase().split("%")[0]!;
  const tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    if (isIP(tail[1]!) !== 4) return null;
    const [a, b, c, d] = tail[1]!.split(".").map(Number) as [number, number, number, number];
    text = `${text.slice(0, -tail[1]!.length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.flatMap((group) => {
    const value = parseInt(group, 16);
    return [value >> 8, value & 0xff];
  });
}

/**
 * True for any address that is not plainly public: loopback, private, link-local (cloud metadata),
 * CGNAT, documentation, benchmarking, multicast and unspecified, in IPv4 or IPv6 form, including
 * IPv4 written inside IPv6 (mapped "::ffff:a.b.c.d", compatible, NAT64 64:ff9b::/96, 6to4 2002::/16).
 * Anything unparsable counts as private.
 */
export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) return privateIPv4(address);
  const bytes = ipv6Bytes(address);
  if (!bytes) return true;
  const v4 = (offset: number) => bytes.slice(offset, offset + 4).join(".");
  const zeros = (from: number, to: number) => bytes.slice(from, to).every((byte) => byte === 0);
  if (zeros(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return privateIPv4(v4(12)); // mapped
  if (zeros(0, 12)) return true; // ::, ::1 and the deprecated IPv4-compatible form
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    zeros(4, 12)
  )
    return privateIPv4(v4(12)); // NAT64
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return privateIPv4(v4(2)); // 6to4
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return true; // documentation
  return (
    (bytes[0]! & 0xfe) === 0xfc || // unique local fc00::/7
    (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80) || // link-local fe80::/10
    bytes[0] === 0xff // multicast
  );
}

/**
 * Production email gateways must be public. Checked when credentials are saved and again before
 * every send, so a host whose DNS later points inside the network is refused.
 */
export async function assertPublicHost(url: string) {
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
          // A redirect could send the request (and its body) to an internal address.
          redirect: "error",
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
