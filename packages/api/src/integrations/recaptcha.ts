import type { IntegrationEnv } from "../context";

export async function verifyRecaptcha(
  env: IntegrationEnv,
  input: { token?: string; fallback?: boolean },
) {
  if (!env.recaptchaSecretKey) {
    return Boolean(input.fallback);
  }

  if (!input.token) {
    return false;
  }

  const body = new URLSearchParams({
    secret: env.recaptchaSecretKey,
    response: input.token,
  });

  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    return false;
  }

  const payload = (await response.json()) as { success?: boolean };
  return payload.success === true;
}
