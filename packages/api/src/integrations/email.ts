import type { IntegrationEnv } from "../context";
import { assertPublicHost } from "./connection-test";

export async function sendEmail(
  env: IntegrationEnv,
  input: { to: string; subject: string; text: string },
) {
  if (!env.smtpUrl) throw new Error("Email delivery is not configured.");

  if (env.smtpUrl.startsWith("https://")) {
    if (process.env.NODE_ENV === "production") await assertPublicHost(env.smtpUrl);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (env.emailApiKey) {
      headers["Authorization"] = `Bearer ${env.emailApiKey}`;
    }
    const response = await fetch(env.smtpUrl, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      // Never follow a redirect: it could point the request at an internal address.
      redirect: "error",
      headers,
      body: JSON.stringify({
        from: env.smtpFrom || "alumni-tracking@localhost",
        ...input,
      }),
    });
    if (!response.ok) {
      throw new Error(`Email endpoint failed: ${response.status}`);
    }
    return { mode: "live" as const };
  }

  throw new Error("SMTP_URL must be an HTTPS JSON mail gateway. Direct SMTP is not supported.");
}
