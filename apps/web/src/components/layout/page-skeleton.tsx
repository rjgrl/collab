import { Skeleton } from "@Alumni-Tracking-Ss/ui/components/skeleton";
import { cn } from "@Alumni-Tracking-Ss/ui/lib/utils";

/** Placeholder in the shape of a page (header, optional photo and tabs, cards) while it loads. */
export function PageSkeleton({
  avatar = false,
  tabs = 0,
  className,
}: {
  avatar?: boolean;
  tabs?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("mx-auto flex w-full max-w-6xl flex-col gap-6", className)}
    >
      <span className="sr-only">Loading</span>
      <div aria-hidden="true" className="flex items-center gap-4">
        {avatar ? <Skeleton className="size-20 shrink-0 rounded-full sm:size-28" /> : null}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
          {avatar ? <Skeleton className="h-5 w-20 rounded-full" /> : null}
        </div>
      </div>
      {tabs ? (
        <div
          aria-hidden="true"
          className="flex w-full flex-wrap gap-1 rounded-xl border bg-card p-1 sm:w-fit"
        >
          {Array.from({ length: tabs }, (_, index) => (
            <Skeleton key={index} className="h-10 grow rounded-lg sm:w-28 sm:grow-0" />
          ))}
        </div>
      ) : null}
      <div
        aria-hidden="true"
        className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
      >
        {[5, 3].map((rows, card) => (
          <div key={card} className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-card">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
