import { useQuery } from "@tanstack/react-query";
import { DataTable, TableCell, TableRow } from "@/components/data/data-table";
import { PageControls, usePagedRows } from "@/components/data/page-controls";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { api } from "@/lib/api";

export function ChangeHistoryTable({ alumniId }: { alumniId: string }) {
  const history = useQuery(api.alumni.history.queryOptions({ input: { id: alumniId } }));
  const paged = usePagedRows(history.data ?? []);
  return (
    <div className="flex flex-col gap-3">
      {history.isError ? (
        <ErrorAlert onRetry={() => void history.refetch()}>{history.error.message}</ErrorAlert>
      ) : null}
      <DataTable
        label="Change history"
        headers={["Date", "Changed by", "Action", "Details"]}
        loading={history.isPending}
        isEmpty={!history.isError && paged.total === 0}
        emptyTitle="No recorded changes"
        emptyDescription="Edits to this alumni record will appear here."
      >
        {paged.rows.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              <time dateTime={new Date(entry.createdAt).toISOString()}>
                {new Date(entry.createdAt).toLocaleString()}
              </time>
            </TableCell>
            <TableCell>{entry.actor?.name ?? "System"}</TableCell>
            <TableCell className="whitespace-nowrap font-medium">{entry.title}</TableCell>
            <TableCell className="min-w-56">
              {entry.details.length ? (
                <ul className="flex flex-col gap-0.5">
                  {entry.details.map((detail, index) => (
                    <li key={index} className="break-words">
                      {detail}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
      <PageControls
        label="Change history pages"
        page={paged.page}
        pageSize={paged.pageSize}
        total={paged.total}
        onPage={paged.setPage}
        onPageSize={paged.setPageSize}
      />
    </div>
  );
}
