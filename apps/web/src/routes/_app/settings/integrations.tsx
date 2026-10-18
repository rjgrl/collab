import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsPage } from "@/components/settings/integrations-page";
export const Route = createFileRoute("/_app/settings/integrations")({
  component: IntegrationsPage,
});
