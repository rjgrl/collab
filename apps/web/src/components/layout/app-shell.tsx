import { API_PREFIX } from "@Alumni-Tracking-Ss/contracts/api-routes";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@Alumni-Tracking-Ss/ui/components/dropdown-menu";
import { cn } from "@Alumni-Tracking-Ss/ui/lib/utils";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Building2,
  ChevronRight,
  ClipboardList,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { AccountAvatar } from "@/components/account/account-avatar";
import { BrandMark } from "@/components/layout/brand-mark";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { queryClient } from "@/lib/api";
import { useSession } from "@/lib/session";
import { canOpenPage } from "@/lib/page-access";
import { AccessDeniedPage, InAppShell } from "@/components/feedback/status-page";
import {
  isAlumniAccount,
  isAdministrator,
  isFacultyAccount,
} from "@Alumni-Tracking-Ss/contracts/names";

const NAV = [
  { to: "/my-profile", label: "My profile", icon: UserRound },
  { to: "/statistics", label: "University statistics", icon: BarChart3 },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/colleges", label: "Colleges", icon: Landmark },
  { to: "/departments", label: "Departments", icon: Building2 },
  { to: "/programs", label: "Programs", icon: GraduationCap },
  { to: "/alumni", label: "Alumni", icon: UserRound },
  { to: "/faculty", label: "Faculty", icon: Users },
  { to: "/reports", label: "Reports", icon: ClipboardList },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/audit", label: "Audit log", icon: ScrollText },
] as const;

type NavItem = (typeof NAV)[number];

const STAFF_SECTIONS = [
  { label: "Overview", paths: ["/dashboard", "/reports"] },
  { label: "Records", paths: ["/alumni", "/faculty"] },
  { label: "Academic structure", paths: ["/colleges", "/departments", "/programs"] },
  { label: "Administration", paths: ["/settings", "/audit"] },
] as const;

const ALUMNI_SECTIONS = [
  { label: "My account", paths: ["/my-profile", "/settings", "/audit"] },
  { label: "University", paths: ["/statistics"] },
] as const;

function isActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function AppShell() {
  const session = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const roleLabel = session.data
    ? isAdministrator(session.data)
      ? "Administrator"
      : isFacultyAccount(session.data)
        ? "Faculty"
        : isAlumniAccount(session.data)
          ? "Alumni"
          : session.data.roles.join(", ") || "Account"
    : "Account";
  const alumniAccount = session.data ? isAlumniAccount(session.data) : false;
  const items = NAV.filter((item) =>
    alumniAccount
      ? ["/my-profile", "/statistics", "/settings", "/audit"].includes(item.to)
      : !["/my-profile", "/statistics"].includes(item.to) && canOpenPage(item.to, session.data),
  );
  const sections = (alumniAccount ? ALUMNI_SECTIONS : STAFF_SECTIONS)
    .map((section) => ({
      label: section.label,
      items: section.paths
        .map((path) => items.find((item) => item.to === path))
        .filter((item): item is NavItem => Boolean(item)),
    }))
    .filter((section) => section.items.length > 0);
  const current = sections
    .flatMap((section) => section.items.map((item) => ({ section: section.label, item })))
    .find(({ item }) => isActive(pathname, item.to));

  async function logout() {
    const response = await fetch(`${API_PREFIX}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
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
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col overflow-y-auto bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-3 px-5 pt-5 pb-4">
          <BrandMark className="size-9" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">
              Alumni tracking
            </p>
            <p className="truncate text-xs text-sidebar-muted">University registry</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 pb-6" aria-label="Main">
          {sections.map((section) => {
            const labelId = `nav-section-${section.label.toLowerCase().replaceAll(" ", "-")}`;
            return (
              <div key={section.label} className="flex flex-col">
                <p
                  id={labelId}
                  className="px-3 pt-4 pb-1.5 text-[0.6875rem] font-semibold tracking-wider text-sidebar-muted uppercase"
                >
                  {section.label}
                </p>
                <ul aria-labelledby={labelId} className="flex flex-col gap-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(pathname, item.to);
                    return (
                      <li key={item.to}>
                        <Link
                          to={item.to}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:outline-sidebar-ring",
                            active &&
                              "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:top-2 before:bottom-2 before:-left-3 before:w-[3px] before:rounded-r-full before:bg-sidebar-primary",
                          )}
                        >
                          <Icon
                            className={cn(
                              "size-4 shrink-0",
                              active ? "text-sidebar-primary" : "text-sidebar-muted",
                            )}
                            aria-hidden="true"
                          />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b bg-card/90 px-3 backdrop-blur-md md:px-8">
          <p className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
            {current ? (
              <>
                <span className="text-muted-foreground">{current.section}</span>
                <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="truncate font-medium text-foreground">{current.item.label}</span>
              </>
            ) : (
              <span className="font-medium text-foreground">Alumni tracking</span>
            )}
          </p>
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="icon" />}>
                <Menu className="size-4" />
                <span className="sr-only">Open menu</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-60">
                {sections.map((section, index) => (
                  <DropdownMenuGroup key={section.label}>
                    {index > 0 ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuLabel>{section.label}</DropdownMenuLabel>
                    {section.items.map((item) => {
                      const active = isActive(pathname, item.to);
                      return (
                        <DropdownMenuItem
                          key={item.to}
                          nativeButton={false}
                          aria-current={active ? "page" : undefined}
                          className={cn(active && "bg-accent font-medium text-accent-foreground")}
                          render={<Link to={item.to} />}
                        >
                          <item.icon className="size-4" />
                          {item.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuGroup>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <BrandMark className="size-8" />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ModeToggle />
            <NotificationsBell />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    className="ml-1 h-auto min-h-10 gap-2.5 rounded-xl py-1 pr-3 pl-1.5"
                    size="sm"
                  />
                }
              >
                <span aria-hidden="true">
                  <AccountAvatar
                    image={session.data?.image}
                    name={session.data?.name ?? "Account"}
                    className="size-8"
                  />
                </span>
                <span className="flex max-w-[5rem] min-w-0 flex-col items-start leading-tight sm:max-w-[14rem]">
                  <span className="w-full truncate">{session.data?.name ?? "Account"}</span>
                  <span
                    className="text-xs font-normal text-muted-foreground"
                    data-testid="account-role"
                  >
                    {roleLabel}
                  </span>
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
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
          className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-6 outline-none sm:px-6 md:px-8 md:py-8"
        >
          <InAppShell.Provider value>
            {session.data && !canOpenPage(pathname, session.data) ? (
              <AccessDeniedPage />
            ) : (
              <Outlet />
            )}
          </InAppShell.Provider>
        </main>
      </div>
    </div>
  );
}
