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
  ] as const;
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6">
      <nav aria-label="Settings" className="flex flex-wrap gap-2 border-b pb-3">
        {sections
          .filter(
            (item) =>
              (item.to !== "/settings/integrations" ||
                (session.data && isAdministrator(session.data))) &&
              (item.permission === null || can(session.data?.permissions, item.permission)),
          )
          .map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: true }}
              aria-current={pathname.replace(/\/$/, "") === item.to ? "page" : undefined}
              className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-muted aria-[current=page]:font-medium"
            >
              {item.label}
            </Link>
          ))}
      </nav>
      <Outlet />
    </div>
  );
}
