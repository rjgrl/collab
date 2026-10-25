import { useQuery } from "@tanstack/react-query";

import { api } from "@/utils/api";

export function useSession() {
  return useQuery({
    ...api.auth.me.queryOptions(),
    staleTime: 30_000,
  });
}

export function can(permissions: string[] | undefined, permission: string) {
  return Boolean(permissions?.includes(permission));
}
