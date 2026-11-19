import { createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/app-shell";
import { isAlumniAccount } from "@Alumni-Tracking-Ss/contracts/names";
import { markSessionEnded, safeReturnPath } from "@/lib/session-ended";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    const meKey = context.api.auth.me.queryOptions().queryKey;
    const wasSignedIn = Boolean(context.queryClient.getQueryData(meKey));
    const user = await context.queryClient.fetchQuery(context.api.auth.me.queryOptions());
    if (!user) {
      // Ended while the app was open: explain it on the sign-in page instead of a silent jump.
      if (wasSignedIn) markSessionEnded();
      const returnTo = safeReturnPath(location.href);
      throw redirect({ to: "/login", search: returnTo ? { redirect: returnTo } : {} });
    }
    if (user.needsProfileCompletion) throw redirect({ to: "/complete-profile" });
    if (user.mfaRequired && !user.mfaVerified) throw redirect({ to: "/security" });
    if (
      isAlumniAccount(user) &&
      !["/my-profile", "/statistics", "/settings", "/settings/", "/audit"].includes(
        location.pathname,
      )
    )
      throw redirect({ to: "/my-profile" });
    return { user };
  },
  component: AppShell,
});
