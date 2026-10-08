import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { Skeleton } from "@Alumni-Tracking-Ss/ui/components/skeleton";
import type { ComponentProps, ReactNode } from "react";

import { EmptyState } from "@/components/page-header";

export function DataTable({
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
    <div className="flex flex-col gap-3">
      {onSearch || toolbar ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {onSearch ? (
            <Input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder={searchPlaceholder ?? "Search"}
              className="max-w-sm"
              aria-label={searchPlaceholder ?? "Search"}
            />
          ) : (
            <div />
          )}
          {toolbar}
        </div>
      ) : null}
      <div className="overflow-x-auto ring-1 ring-foreground/10">
        <table className="w-full min-w-[32rem] text-left text-sm md:min-w-0">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  className={header === "Actions" ? "px-3 py-2.5 text-right font-medium" : "px-3 py-2.5 font-medium"}
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

export function TableRow({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={className ?? "border-t border-border/70 hover:bg-muted/40"}>{children}</tr>;
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
    <td className={className ?? "px-3 py-2.5 align-middle"} colSpan={colSpan}>
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
