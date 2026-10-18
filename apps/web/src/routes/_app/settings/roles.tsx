import { createFileRoute } from "@tanstack/react-router";
import { RolesPage } from "@/components/settings/roles-page";
export const Route = createFileRoute("/_app/settings/roles")({ component: RolesPage });
