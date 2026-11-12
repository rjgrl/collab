import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DataTable, TableCell, TableRow } from "@/components/data/data-table";
import { PageControls, type PageSize } from "@/components/data/page-controls";
import { StatusBadge } from "@/components/data/status-badge";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { api } from "@/lib/api";

export function TrackingTable({
  alumniId,
  page,
  onPageChange,
}: {
  alumniId: string;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const events = useQuery({
    ...api.alumni.trackingEvents.queryOptions({ input: { alumniId, page, pageSize } }),
    placeholderData: keepPreviousData,
  });
  const total = events.data?.total ?? 0;

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
      <PageControls
        label="Tracking history pages"
        page={page}
        pageSize={pageSize}
        total={total}
        pending={events.isFetching}
        onPage={onPageChange}
        onPageSize={(size) => {
          setPageSize(size);
          onPageChange(1);
        }}
      />
    </div>
  );
}
