import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { PageHeader, PageShell } from "@/components/page-header";
import { api } from "@/utils/api";
import { TablePagination } from "@/components/table-pagination";

export const Route = createFileRoute("/_app/audit")({
  component: AuditPage,
});

function AuditPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const logs = useQuery(api.audit.list.queryOptions({ input: { search, page, pageSize: 20 } }));

  return (
    <PageShell>
      <PageHeader
        title="Audit log"
        description="Recorded account, alumni, and integration actions."
      />
      {logs.isError ? <p role="alert">{logs.error.message}</p> : null}
      <DataTable
        headers={["When", "Actor", "Action", "Record", "Summary"]}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search audit log"
        loading={logs.isPending}
        isEmpty={logs.data?.length === 0}
        emptyTitle="No audit events found"
        emptyDescription="Actions such as sign-in, alumni updates, and imports appear here."
      >
        {logs.data?.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <time
                className="whitespace-nowrap"
                dateTime={row.createdAt.toISOString()}
                title={row.createdAt.toISOString()}
              >
                {row.createdAt.toLocaleString()}
              </time>
            </TableCell>
            <TableCell>
              <div>{row.actor?.email ?? (row.actorId ? "Unavailable account" : "System")}</div>
              {row.actor && !row.actorIsSnapshot ? (
                <div className="text-xs text-muted-foreground">
                  Current identity; not recorded at event time
                </div>
              ) : null}
            </TableCell>
            <TableCell>{row.action}</TableCell>
            <TableCell>
              <div>{row.entity}</div>
              <div className="break-all text-xs text-muted-foreground">{row.entityId ?? "—"}</div>
            </TableCell>
            <TableCell>
              <div className="min-w-64 max-w-xl whitespace-pre-wrap break-words">
                {row.summary || "No summary was recorded for this event."}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
      <TablePagination
        page={page}
        onPage={setPage}
        hasNext={logs.data?.length === 20}
        pending={logs.isFetching}
      />
    </PageShell>
  );
}
