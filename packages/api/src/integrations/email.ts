import type { IntegrationEnv } from "../context";

export const RESEND_EMAIL_URL = "https://api.resend.com/emails";

export async function sendEmail(
  env: IntegrationEnv,
  input: { to: string; subject: string; text: string },
) {
  if (!env.emailApiKey || !env.smtpFrom)
    throw new Error("Resend email delivery is not configured.");
  const response = await fetch(RESEND_EMAIL_URL, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.emailApiKey}`,
    },
    body: JSON.stringify({ from: env.smtpFrom, ...input, to: [input.to] }),
  });
  // Never expose provider response bodies: they may include addresses or credentials.
  if (!response.ok) throw new Error(`Resend email delivery failed (${response.status}).`);
  return { mode: "live" as const };
}
