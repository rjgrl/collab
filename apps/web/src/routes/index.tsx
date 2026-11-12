import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.fetchQuery(context.api.auth.me.queryOptions());
    throw redirect({ to: user ? "/dashboard" : "/login" });
  },
  component: function IndexRedirect() {
    return null;
  },
});
