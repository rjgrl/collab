import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { Skeleton } from "@Alumni-Tracking-Ss/ui/components/skeleton";
import { cn } from "@Alumni-Tracking-Ss/ui/lib/utils";
import { Search } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { EmptyState } from "@/components/layout/page";

export function DataTable({
  label = "Scrollable records table",
  headers,
  children,
  search,
  onSearch,
  searchPlaceholder,
  toolbar,
  loading,
  emptyTitle = "No records found",
  emptyDescription = "Try a different search or add a new record.",
  isEmpty,
}: {
  label?: string;
  headers: string[];
  children: ReactNode;
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  toolbar?: ReactNode;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  isEmpty?: boolean;
}) {
  const showEmpty = Boolean(isEmpty) && !loading;

  return (
    <div className="flex min-w-0 flex-col gap-4" aria-busy={loading || undefined}>
      {onSearch || toolbar ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {onSearch ? (
            <div className="relative w-full max-w-sm">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                placeholder={searchPlaceholder ?? "Search"}
                className="pl-9"
                aria-label={searchPlaceholder ?? "Search"}
              />
            </div>
          ) : (
            <div />
          )}
          {toolbar}
        </div>
      ) : null}
      <div
        role="region"
        aria-label={label}
        tabIndex={0}
        className="relative overflow-x-auto rounded-xl border border-border bg-card shadow-card focus-visible:outline-2 focus-visible:outline-ring"
      >
        <table className="w-full min-w-[32rem] text-left text-sm md:min-w-0">
          <thead className="bg-muted/70 text-[0.6875rem] tracking-wider text-muted-foreground uppercase">
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  className={
                    header === "Actions" ||
                    /^(Graduates|Tracked|Untracked|% tracked|Count|Users|Programs|Alumni)$/.test(
                      header,
                    )
                      ? "px-4 py-2.5 text-right font-semibold"
                      : "px-4 py-2.5 font-semibold"
                  }
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableRow>
                <TableCell className="px-3 py-3" colSpan={headers.length}>
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-3/5" />
                  </div>
                </TableCell>
              </TableRow>
            ) : null}
            {showEmpty ? (
              <TableRow>
                <TableCell className="p-0" colSpan={headers.length}>
                  <EmptyState compact title={emptyTitle} description={emptyDescription} />
                </TableCell>
              </TableRow>
            ) : null}
            {!loading && !showEmpty ? children : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      className={cn("border-t border-border/80 transition-colors hover:bg-muted/50", className)}
      {...props}
    />
  );
}

export function TableCell({
  children,
  className,
  colSpan,
}: {
  children: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td className={cn("px-4 py-3.5 align-middle break-words", className)} colSpan={colSpan}>
      {children}
    </td>
  );
}

export function RowActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-2 whitespace-nowrap">{children}</div>;
}

export function QuietButton(props: ComponentProps<typeof Button>) {
  return <Button variant="outline" size="sm" {...props} />;
}
