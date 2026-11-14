import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { SectionTabs, sectionTabClass } from "@/components/layout/section-tabs";
import { useSession } from "@/lib/session";
import { canOpenPage } from "@/lib/page-access";

export const Route = createFileRoute("/_app/settings")({ component: SettingsLayout });

function SettingsLayout() {
  const session = useSession();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const sections = [
    { to: "/settings", label: "Account" },
    { to: "/settings/users", label: "Members" },
    { to: "/settings/roles", label: "Roles and permissions" },
    { to: "/settings/integrations", label: "Integrations" },
    { to: "/settings/backups", label: "Backups" },
  ] as const;
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6">
      <SectionTabs label="Settings">
        {sections
          .filter((item) => canOpenPage(item.to, session.data))
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
