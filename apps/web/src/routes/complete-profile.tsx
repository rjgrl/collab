import { createFileRoute, redirect } from "@tanstack/react-router";
import { AccountVerification } from "@/components/account-verification";

export const Route = createFileRoute("/complete-profile")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.fetchQuery(context.api.auth.me.queryOptions());
    if (!user) throw redirect({ to: "/login" });
    if (!user.needsProfileCompletion) throw redirect({ to: "/dashboard" });
  },
  component: AccountVerification,
});
