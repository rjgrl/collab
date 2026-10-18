import { createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.fetchQuery(context.orpc.auth.me.queryOptions());
    if (!user) {
      throw redirect({ to: "/login" });
    }
    if (user.needsProfileCompletion) throw redirect({ to: "/complete-profile" });
    return { user };
  },
  component: AppShell,
});
