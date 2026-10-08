import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

export function useSession() {
  return useQuery({
    ...orpc.auth.me.queryOptions(),
    staleTime: 30_000,
  });
}

export function can(permissions: string[] | undefined, permission: string) {
  return Boolean(permissions?.includes(permission));
}

function toRequestError(response: Response, text: string) {
  if (text.includes("Internal Server") || text.startsWith("Internal S")) {
    return new Error("Unable to reach the database. Check that MongoDB Atlas is running and this network is allowed.");
  }
  return new Error(text.slice(0, 180) || `Request failed (${response.status}).`);
}

export async function postJson<T>(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload: (T & { error?: string }) | null = null;
  if (text) {
    try {
      payload = JSON.parse(text) as T & { error?: string };
    } catch {
      throw toRequestError(response, text);
    }
  }
  if (!response.ok) {
    throw new Error(payload?.error || "Request failed.");
  }
  return (payload ?? {}) as T;
}
