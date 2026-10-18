import type { IntegrationEnv } from "../context";

export async function sendEmail(
  env: IntegrationEnv,
  input: { to: string; subject: string; text: string },
) {
  if (!env.smtpUrl) throw new Error("Email delivery is not configured.");

  if (env.smtpUrl.startsWith("https://")) {
    const response = await fetch(env.smtpUrl, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json" },
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
