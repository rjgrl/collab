import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { TRACKING_PAGE_SIZES, type TrackingPageSize } from "@Alumni-Tracking-Ss/contracts/alumni";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { DataTable, TableCell, TableRow } from "@/components/data/data-table";
import { StatusBadge } from "@/components/data/status-badge";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { FormSelect } from "@/components/forms/form-select";
import { api } from "@/lib/api";

/** Page numbers to show: first, last, and a window around the current page, with gaps as null. */
function pageWindow(page: number, pages: number): (number | null)[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1]);
  const sorted = [...wanted].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  return sorted.flatMap((n, index) => (index > 0 && n - sorted[index - 1]! > 1 ? [null, n] : [n]));
}

export function TrackingTable({
  alumniId,
  page,
  onPageChange,
}: {
  alumniId: string;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const [pageSize, setPageSize] = useState<TrackingPageSize>(10);
  const events = useQuery({
    ...api.alumni.trackingEvents.queryOptions({ input: { alumniId, page, pageSize } }),
    placeholderData: keepPreviousData,
  });
  const total = events.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3">
      {events.isError ? (
        <ErrorAlert onRetry={() => void events.refetch()}>{events.error.message}</ErrorAlert>
      ) : null}
      <DataTable
        label="Tracking history"
        headers={["Date", "Status", "Tracker", "Source", "Notes"]}
        loading={events.isPending}
        isEmpty={!events.isError && total === 0}
        emptyTitle="No tracking events yet"
        emptyDescription="Mark this alumnus tracked or untracked to start the history."
      >
        {events.data?.items.map((event) => (
          <TableRow key={event.id}>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {event.recordedAt ? (
                <time dateTime={new Date(event.recordedAt).toISOString()}>
                  {new Date(event.recordedAt).toLocaleString()}
                </time>
              ) : (
                "Not recorded"
              )}
            </TableCell>
            <TableCell>
              <StatusBadge tone={event.isTracked ? "tracked" : "untracked"} />
            </TableCell>
            <TableCell>{event.trackerName ?? "Not recorded"}</TableCell>
            <TableCell className="capitalize">{event.source}</TableCell>
            <TableCell className="min-w-48 whitespace-pre-wrap break-words">
              {event.notes || <span className="text-muted-foreground">—</span>}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
      {total > 0 ? (
        <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <p role="status" className="text-muted-foreground tabular-nums">
              Showing {first}–{last} of {total}
            </p>
            <div className="flex items-center gap-2">
              <span id={`${alumniId}-rows`} className="text-muted-foreground">
                Rows per page
              </span>
              <FormSelect
                aria-labelledby={`${alumniId}-rows`}
                className="w-20"
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value) as TrackingPageSize);
                  onPageChange(1);
                }}
                items={TRACKING_PAGE_SIZES.map((size) => ({
                  value: String(size),
                  label: String(size),
                }))}
              />
            </div>
          </div>
          {pages > 1 ? (
            <nav aria-label="Tracking history pages" className="flex flex-wrap items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || events.isFetching}
                onClick={() => onPageChange(page - 1)}
              >
                Previous page
              </Button>
              {pageWindow(page, pages).map((n, index) =>
                n === null ? (
                  <span key={`gap-${index}`} aria-hidden="true" className="px-1">
                    …
                  </span>
                ) : (
                  <Button
                    key={n}
                    variant={n === page ? "default" : "ghost"}
                    size="sm"
                    aria-label={`Page ${n}`}
                    aria-current={n === page ? "page" : undefined}
                    disabled={events.isFetching && n !== page}
                    onClick={() => onPageChange(n)}
                  >
                    {n}
                  </Button>
                ),
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages || events.isFetching}
                onClick={() => onPageChange(page + 1)}
              >
                Next page
              </Button>
            </nav>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
