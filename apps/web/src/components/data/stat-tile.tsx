import { Skeleton } from "@Alumni-Tracking-Ss/ui/components/skeleton";
import { cn } from "@Alumni-Tracking-Ss/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4", className)}>{children}</dl>
  );
}

export function StatTile({
  label,
  value,
  loading = false,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string | number | undefined;
  loading?: boolean;
  icon?: LucideIcon;
  hint?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 shadow-card sm:p-5">
      <dt className="flex items-start justify-between gap-3 text-sm font-medium text-muted-foreground">
        {label}
        {Icon ? (
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"
          >
            <Icon className="size-4" />
          </span>
        ) : null}
      </dt>
      <dd className="flex flex-col gap-1">
        <div className="text-2xl font-semibold tracking-tight tabular-nums sm:text-[1.75rem] sm:leading-9">
          {loading ? (
            <Skeleton className="h-8 w-20" />
          ) : typeof value === "number" ? (
            value.toLocaleString()
          ) : (
            (value ?? "—")
          )}
        </div>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </dd>
    </div>
  );
}
