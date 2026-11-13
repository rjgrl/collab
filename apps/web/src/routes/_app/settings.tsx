import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { isAdministrator } from "@Alumni-Tracking-Ss/contracts/names";
import { SectionTabs, sectionTabClass } from "@/components/layout/section-tabs";
import { can, useSession } from "@/lib/session";

export const Route = createFileRoute("/_app/settings")({ component: SettingsLayout });

function SettingsLayout() {
  const session = useSession();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const sections = [
    { to: "/settings", label: "Account", permission: null },
    { to: "/settings/users", label: "Members", permission: "users.read" },
    { to: "/settings/roles", label: "Roles and permissions", permission: "roles.read" },
    { to: "/settings/integrations", label: "Integrations", permission: "integrations.read" },
    { to: "/settings/backups", label: "Backups", permission: null },
  ] as const;
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6">
      <SectionTabs label="Settings">
        {sections
          .filter(
            (item) =>
              (!/^\/(integrations|backups)$/.test(item.to.replace(/^\/settings/, "")) ||
                (session.data && isAdministrator(session.data))) &&
              (item.permission === null || can(session.data?.permissions, item.permission)),
          )
          .map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: true }}
              aria-current={pathname.replace(/\/$/, "") === item.to ? "page" : undefined}
              className={sectionTabClass}
            >
              {item.label}
            </Link>
          ))}
      </SectionTabs>
      <Outlet />
    </div>
  );
}
