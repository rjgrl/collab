import { createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { isAlumniAccount } from "@Alumni-Tracking-Ss/contracts/names";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.fetchQuery(context.api.auth.me.queryOptions());
    if (!user) {
      throw redirect({ to: "/login" });
    }
    if (user.needsProfileCompletion) throw redirect({ to: "/complete-profile" });
    if (user.mfaRequired && !user.mfaVerified) throw redirect({ to: "/security" });
    if (
      isAlumniAccount(user) &&
      !["/my-profile", "/statistics", "/settings", "/settings/"].includes(location.pathname)
    )
      throw redirect({ to: "/my-profile" });
    return { user };
  },
  component: AppShell,
});
