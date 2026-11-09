// Test-runner request descriptions only; no legacy transports are exposed by the app.
const endpoints: Record<string, { method: string; path: string }> = {
  "auth/me": { method: "GET", path: "/api/auth/me" },
  "auth/login": { method: "POST", path: "/api/auth/login" },
  "auth/signup": { method: "POST", path: "/api/auth/signup" },
  "auth/logout": { method: "POST", path: "/api/auth/logout" },
  "auth/beginMfa": { method: "POST", path: "/api/auth/mfa/enrollments" },
  "auth/confirmMfa": { method: "POST", path: "/api/auth/mfa/confirmations" },
  "auth/verifyMfa": { method: "POST", path: "/api/auth/mfa/verifications" },
  "auth/resetPassword": { method: "POST", path: "/api/auth/password-resets" },
  "auth/updateProfile": { method: "PATCH", path: "/api/auth/profile" },
  "alumni/list": { method: "GET", path: "/api/alumni" },
  "alumni/get": { method: "GET", path: "/api/alumni/:id" },
  "alumni/delete": { method: "DELETE", path: "/api/alumni/:id" },
  "users/list": { method: "GET", path: "/api/users" },
  "reports/alumniCsv": { method: "GET", path: "/api/reports/alumni.csv" },
  "dashboard/summary": { method: "GET", path: "/api/dashboard" },
};

export async function acceptanceRequest(
  base: string,
  action: string,
  input: unknown = {},
  token?: string,
  headers: Record<string, string> = {},
  methodOverride?: string,
  trailingSlash = false,
) {
  const endpoint = endpoints[action];
  if (!endpoint && !action.startsWith("/")) throw new Error("Unknown acceptance-test endpoint");
  const fields =
    input && typeof input === "object" ? Object.fromEntries(Object.entries(input)) : {};
  const method = methodOverride ?? endpoint?.method ?? "POST";
  const path = (endpoint?.path ?? action).replace(/:id\b/g, () => {
    const id: unknown = fields.id;
    delete fields.id;
    return encodeURIComponent(String(id));
  });
  const url = new URL(base + path + (trailingSlash && !path.endsWith("/") ? "/" : ""));
  if (method === "GET")
    for (const [key, value] of Object.entries(fields))
      if (value !== undefined) url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(fields) }),
    signal: AbortSignal.timeout(15000),
    redirect: "manual",
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = text;
  }
  return { response, body, text };
}
