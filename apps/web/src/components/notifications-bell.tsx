import { Bell } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
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
import { api, client, queryClient } from "@/utils/api";
import { toast } from "sonner";

export function NotificationsBell() {
  const navigate = useNavigate();
  const options = api.notifications.list.queryOptions({ input: {} });
  const notifications = useQuery({ ...options, refetchInterval: 30_000 });
  const unreadCount = notifications.data?.unreadCount ?? 0;
  const open = useMutation({
    mutationFn: async (item: { id: string; alumniId: string; evidenceId: string }) => {
      await client.notifications.markRead({ id: item.id });
      await queryClient.invalidateQueries({ queryKey: options.queryKey });
      await navigate({
        to: "/alumni/$id",
        params: { id: item.alumniId },
        hash: `evidence-${item.evidenceId}`,
      });
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <DropdownMenu
      onOpenChange={(isOpen) => {
        if (isOpen) void notifications.refetch();
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            className="relative"
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
            data-testid="notifications-bell"
          />
        }
      >
        <Bell aria-hidden="true" className="size-4" />
        {unreadCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 max-w-[calc(100vw-2rem)]"
        render={(props) => (
          <section aria-label="Notifications">
            <div {...props} />
          </section>
        )}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            Notifications{unreadCount ? ` · ${unreadCount} unread` : ""}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {notifications.isPending ? (
            <DropdownMenuItem disabled>Loading notifications…</DropdownMenuItem>
          ) : notifications.isError ? (
            <DropdownMenuItem onClick={() => void notifications.refetch()}>
              Unable to load notifications. Retry
            </DropdownMenuItem>
          ) : !notifications.data?.items.length ? (
            <DropdownMenuItem disabled>No notifications.</DropdownMenuItem>
          ) : (
            notifications.data.items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                disabled={open.isPending}
                onClick={() => open.mutate(item)}
                className="items-start whitespace-normal py-3"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className={item.readAt ? "text-muted-foreground" : "font-medium"}>
                    {item.summary}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.readAt ? "Read" : "Unread"} · {item.createdAt.toLocaleString()}
                  </span>
                </span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
