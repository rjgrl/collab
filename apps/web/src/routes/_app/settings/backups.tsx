import { createFileRoute } from "@tanstack/react-router";
import { BackupsPage } from "@/components/settings/backups-page";

// Access is checked by the app shell (canOpenPage), which shows Access denied when refused.
export const Route = createFileRoute("/_app/settings/backups")({ component: BackupsPage });
