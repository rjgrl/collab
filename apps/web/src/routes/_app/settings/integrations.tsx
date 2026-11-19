import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsPage } from "@/components/settings/integrations-page";

// Access is checked by the app shell (canOpenPage), which shows Access denied when refused.
export const Route = createFileRoute("/_app/settings/integrations")({
  component: IntegrationsPage,
});
