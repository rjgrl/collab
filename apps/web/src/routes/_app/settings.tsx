import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { isAdministrator } from "@Alumni-Tracking-Ss/contracts/names";
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
      <nav
        aria-label="Settings"
        className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl border bg-card p-1 shadow-card"
      >
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
              className="inline-flex min-h-10 items-center rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground pointer-coarse:min-h-11"
            >
              {item.label}
            </Link>
          ))}
      </nav>
      <Outlet />
    </div>
  );
}
