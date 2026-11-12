import { createFileRoute, redirect } from "@tanstack/react-router";
import { IntegrationsPage } from "@/components/settings/integrations-page";
import { isAdministrator } from "@Alumni-Tracking-Ss/contracts/names";
export const Route = createFileRoute("/_app/settings/integrations")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.fetchQuery(context.api.auth.me.queryOptions());
    if (!user || !isAdministrator(user)) throw redirect({ to: "/settings" });
  },
  component: IntegrationsPage,
});
