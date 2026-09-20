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

export async function postJson<T>(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}
