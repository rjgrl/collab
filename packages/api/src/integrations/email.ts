import type { IntegrationEnv } from "../context";

export async function sendEmail(
  env: IntegrationEnv,
  input: { to: string; subject: string; text: string },
) {
  if (!env.smtpUrl) {
    console.info("[email:fallback]", input);
    return { mode: "fallback" as const };
  }

  if (env.smtpUrl.startsWith("http://") || env.smtpUrl.startsWith("https://")) {
    const response = await fetch(env.smtpUrl, {
      method: "POST",
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

  console.info("[email:smtp-url-logged]", input);
  return { mode: "fallback" as const };
}
