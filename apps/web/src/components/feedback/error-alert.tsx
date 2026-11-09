import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { cn } from "@Alumni-Tracking-Ss/ui/lib/utils";
import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

/** Page- or section-level failure message with an optional retry action inside the alert. */
export function ErrorAlert({
  children,
  onRetry,
  retryLabel = "Retry",
  className,
}: {
  children: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-foreground dark:bg-destructive/10",
        className,
      )}
    >
      <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
