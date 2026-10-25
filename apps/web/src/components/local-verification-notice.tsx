import { useQuery } from "@tanstack/react-query";
import { api } from "@/utils/api";
export function LocalVerificationNotice() {
  const config = useQuery(api.auth.config.queryOptions());
  if (!import.meta.env.DEV || !config.data?.contactVerification?.localBypass) return null;
  return (
    <p
      role="note"
      className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
    >
      Local functionality testing: contact verification is optional. Unverified contacts stay
      unverified; password, session and permission checks still apply.
    </p>
  );
}
