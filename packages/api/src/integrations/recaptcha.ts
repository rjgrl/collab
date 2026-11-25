import type { IntegrationEnv } from "../context";

export type RecaptchaAction = "LOGIN" | "SIGNUP";
export type RecaptchaVerdict = "passed" | "rejected" | "unavailable";

/** Google Cloud project IDs: 6-30 lowercase letters, digits or hyphens, starting with a letter. */
export const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

type Assessment = {
  tokenProperties?: { valid?: boolean; invalidReason?: string; action?: string };
};

/**
 * Creates a Fraud Defense (reCAPTCHA Enterprise) assessment. The API key travels in a header,
 * never in the URL, so request logs and proxies cannot capture it.
 */
export function createAssessment(
  input: { projectId: string; apiKey: string; siteKey: string; token: string; action?: string },
  fetcher: typeof fetch = fetch,
) {
  return fetcher(
    `https://recaptchaenterprise.googleapis.com/v1/projects/${encodeURIComponent(input.projectId)}/assessments`,
    {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/json", "x-goog-api-key": input.apiKey },
      body: JSON.stringify({
        event: {
          token: input.token,
          siteKey: input.siteKey,
          ...(input.action ? { expectedAction: input.action } : {}),
        },
      }),
    },
  );
}

export async function verifyRecaptcha(
  env: IntegrationEnv,
  input: { token?: string; fallback?: boolean; action: RecaptchaAction },
  fetcher: typeof fetch = fetch,
): Promise<RecaptchaVerdict> {
  const { recaptchaSiteKey: siteKey, recaptchaProjectId: projectId, recaptchaApiKey: apiKey } = env;
  if (!siteKey || !projectId || !apiKey) {
    return process.env.NODE_ENV !== "production" && input.fallback ? "passed" : "rejected";
  }
  if (!input.token) return "rejected";

  let assessment: Assessment;
  try {
    const response = await createAssessment(
      { projectId, apiKey, siteKey, token: input.token, action: input.action },
      fetcher,
    );
    if (!response.ok) return "unavailable";
    assessment = (await response.json()) as Assessment;
  } catch {
    // Never log the token, key or provider error body.
    return "unavailable";
  }

  const token = assessment.tokenProperties;
  return token?.valid === true && token.action === input.action ? "passed" : "rejected";
}
