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
  Plug,
  ScrollText,
  Shield,
  Users,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { ModeToggle } from "@/components/mode-toggle";
import { can, useSession } from "@/lib/session";
import { queryClient } from "@/utils/orpc";

const NAV = [
  { to: "/dashboard", label: "Dashboard", permission: "dashboard.read", icon: LayoutDashboard },
  { to: "/departments", label: "Departments", permission: "departments.read", icon: Building2 },
  { to: "/programs", label: "Programs", permission: "programs.read", icon: GraduationCap },
  { to: "/faculties", label: "Faculties", permission: "faculties.read", icon: Users },
  { to: "/alumni", label: "Alumni", permission: "alumni.read", icon: UserRound },
  { to: "/reports", label: "Reports", permission: "reports.read", icon: ClipboardList },
  { to: "/users", label: "Users", permission: "users.read", icon: Shield },
  { to: "/roles", label: "Roles", permission: "roles.read", icon: Shield },
  { to: "/integrations", label: "Integrations", permission: "integrations.read", icon: Plug },
  { to: "/audit", label: "Audit log", permission: "audit.read", icon: ScrollText },
] as const;

export function AppShell() {
  const session = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const permissions = session.data?.permissions ?? [];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    await queryClient.clear();
    toast.success("Signed out");
    await navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="hidden w-60 shrink-0 border-r bg-sidebar text-sidebar-foreground md:flex md:flex-col">
        <div className="flex h-14 items-center px-4 text-sm font-medium">Alumni Tracking</div>
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {NAV.filter((item) => can(permissions, item.permission)).map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2 px-2 py-2 text-sm hover:bg-sidebar-accent",
                  active && "bg-sidebar-accent font-medium",
                )}
              >
                <Icon />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b px-4">
          <div className="text-sm text-muted-foreground md:hidden">Alumni Tracking</div>
          <div className="ml-auto flex items-center gap-2">
            <ModeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                {session.data?.name ?? "Account"}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuGroup>
                  <DropdownMenuItem disabled>
                    {session.data?.email}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void logout()}>
                    <LogOut data-icon="inline-start" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
