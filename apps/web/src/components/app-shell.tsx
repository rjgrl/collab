import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@Alumni-Tracking-Ss/ui/components/dropdown-menu";
import { cn } from "@Alumni-Tracking-Ss/ui/lib/utils";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { ModeToggle } from "@/components/mode-toggle";
import { can, useSession } from "@/lib/session";
import { queryClient } from "@/utils/api";
import { isAlumniAccount, isAdministrator } from "@Alumni-Tracking-Ss/contracts/names";
import { LocalVerificationNotice } from "./local-verification-notice";
import { NotificationsBell } from "./notifications-bell";
import { AccountAvatar } from "./account-avatar";

const NAV = [
  { to: "/my-profile", label: "My Profile", permission: null, icon: UserRound },
  { to: "/statistics", label: "University statistics", permission: null, icon: LayoutDashboard },
  { to: "/dashboard", label: "Dashboard", permission: "dashboard.read", icon: LayoutDashboard },
  { to: "/departments", label: "Departments", permission: "departments.read", icon: Building2 },
  { to: "/programs", label: "Programs", permission: "programs.read", icon: GraduationCap },
  { to: "/alumni", label: "Alumni", permission: "alumni.read", icon: UserRound },
  { to: "/reports", label: "Reports", permission: "reports.read", icon: ClipboardList },
  { to: "/settings", label: "Settings", permission: null, icon: Settings },
  { to: "/audit", label: "Audit log", permission: "audit.read", icon: ScrollText },
] as const;

function navClass(active: boolean) {
  return cn(
    "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent",
    active && "bg-sidebar-accent text-sidebar-accent-foreground font-semibold",
  );
}

export function AppShell() {
  const session = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const permissions = session.data?.permissions ?? [];
  const roleLabel = session.data
    ? isAdministrator(session.data)
      ? "Administrator"
      : session.data.roles.includes("staff")
        ? "Staff"
        : isAlumniAccount(session.data)
          ? "Alumni"
          : session.data.roles.join(", ") || "Account"
    : "Account";
  const alumniAccount = session.data ? isAlumniAccount(session.data) : false;
  const items = NAV.filter((item) =>
    alumniAccount
      ? ["/my-profile", "/statistics", "/settings"].includes(item.to)
      : !["/my-profile", "/statistics"].includes(item.to) &&
        (item.permission === null || can(permissions, item.permission)),
  );

  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    if (!response.ok) {
      toast.error("Unable to sign out. Try again.");
      return;
    }
    await queryClient.clear();
    toast.success("Signed out");
    await navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-svh bg-background">
      <a
        href="#main-content"
        className="sr-only fixed top-2 left-2 z-50 rounded-lg bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only"
      >
        Skip to main content
      </a>
      <aside className="hidden w-56 shrink-0 bg-sidebar text-sidebar-foreground md:flex md:flex-col">
        <div className="flex items-center gap-3 px-4 py-5">
          <GraduationCap className="size-7" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">Alumni Tracking</p>
            <p className="mt-0.5 text-xs text-muted-foreground">University registry</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 py-2" aria-label="Main">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={navClass(active)}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-card md:my-3 md:mr-3 md:rounded-xl md:border md:border-border">
        <header className="flex min-h-16 items-center gap-2 border-b px-3 md:px-6">
          <p className="hidden text-sm font-medium text-muted-foreground md:block">
            {items.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
              ?.label ?? "Alumni Tracking"}
          </p>
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="icon" />}>
                <Menu className="size-4" />
                <span className="sr-only">Open menu</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-52">
                <DropdownMenuGroup>
                  {items.map((item) => (
                    <DropdownMenuItem
                      key={item.to}
                      nativeButton={false}
                      render={<Link to={item.to} />}
                    >
                      <item.icon className="size-4" />
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <GraduationCap className="size-5 shrink-0 text-primary" aria-hidden="true" />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <ModeToggle />
            <NotificationsBell />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" className="h-auto min-h-10 py-1" size="sm" />}
              >
                <span aria-hidden="true">
                  <AccountAvatar
                    image={session.data?.image}
                    name={session.data?.name ?? "Account"}
                    className="size-8"
                  />
                </span>
                <span className="flex min-w-0 max-w-[5rem] flex-col items-start sm:max-w-[14rem]">
                  <span className="w-full truncate">{session.data?.name ?? "Account"}</span>
                  <span
                    className="text-xs font-normal text-muted-foreground"
                    data-testid="account-role"
                  >
                    {roleLabel}
                  </span>
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuGroup>
                  <DropdownMenuItem disabled>{session.data?.email}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void logout()}>
                    <LogOut data-icon="inline-start" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col gap-4 p-4 outline-none md:p-6 lg:p-8"
        >
          <LocalVerificationNotice />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
