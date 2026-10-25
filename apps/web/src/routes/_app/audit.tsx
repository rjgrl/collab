import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { PageHeader, PageShell } from "@/components/page-header";
import { api } from "@/utils/api";
import { TablePagination } from "@/components/table-pagination";
import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { auditOutputSchema } from "@Alumni-Tracking-Ss/contracts/audit";
import type { z } from "zod";
import { ChevronRight } from "lucide-react";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";

export const Route = createFileRoute("/_app/audit")({
  component: AuditPage,
});

function AuditPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<z.infer<typeof auditOutputSchema> | null>(null);
  const logs = useQuery(api.audit.list.queryOptions({ input: { search, page, pageSize: 20 } }));

  return (
    <PageShell>
      <PageHeader
        title="Audit log"
        description="Recorded account, alumni, and integration actions. Select an event to view its full summary."
      />
      {logs.isError ? (
        <p role="alert" className="rounded-lg border p-4 text-sm">
          {logs.error.message}
        </p>
      ) : null}
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
          <TableRow
            key={row.id}
            className="cursor-pointer focus-within:bg-muted/40"
            onClick={() => setSelected(row)}
          >
            <TableCell>
              <time
                className="whitespace-nowrap text-xs tabular-nums text-muted-foreground"
                dateTime={row.createdAt.toISOString()}
                title={row.createdAt.toISOString()}
              >
                {row.createdAt.toLocaleString()}
              </time>
            </TableCell>
            <TableCell>
              <div className="font-medium">
                {row.actor?.email ?? (row.actorId ? "Unavailable account" : "System")}
              </div>
              {row.actor && !row.actorIsSnapshot ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  Current identity; not recorded at event time
                </div>
              ) : null}
            </TableCell>
            <TableCell>
              <span className="whitespace-nowrap font-medium">{row.action}</span>
            </TableCell>
            <TableCell>
              <div>{row.entity}</div>
              <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
                {row.entityId ?? "—"}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex w-64 items-center gap-2 text-sm text-muted-foreground">
                <span className="line-clamp-2 min-w-0 flex-1 whitespace-pre-wrap break-all">
                  {row.summary || "No summary was recorded for this event."}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`View audit details for ${row.action} at ${row.createdAt.toISOString()}`}
                  aria-haspopup="dialog"
                  aria-expanded={selected?.id === row.id}
                  className="shrink-0"
                >
                  <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                </Button>
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
      {selected ? (
        <FormDialog
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          title="Audit event details"
          description="The recorded details for this individual event."
        >
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">When</dt>
              <dd className="mt-1">
                <time dateTime={selected.createdAt.toISOString()}>
                  {selected.createdAt.toLocaleString()}
                </time>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Actor</dt>
              <dd className="mt-1 break-all">
                {selected.actor?.email ?? (selected.actorId ? "Unavailable account" : "System")}
              </dd>
              {selected.actor && !selected.actorIsSnapshot ? (
                <dd className="mt-1 text-xs text-muted-foreground">
                  Current identity; not recorded at event time
                </dd>
              ) : null}
            </div>
            <div>
              <dt className="text-muted-foreground">Action</dt>
              <dd className="mt-1 break-all font-medium">{selected.action}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Record</dt>
              <dd className="mt-1 break-all">
                {selected.entity}
                {selected.entityId ? ` · ${selected.entityId}` : ""}
              </dd>
            </div>
          </dl>
          <section
            className="mt-5 border-t pt-5"
            aria-labelledby="audit-summary-heading"
            tabIndex={0}
          >
            <h2 id="audit-summary-heading" className="text-sm font-semibold">
              Full summary
            </h2>
            <p className="mt-3 whitespace-pre-wrap break-all text-sm leading-6">
              {selected.summary || "No summary was recorded for this event."}
            </p>
          </section>
        </FormDialog>
      ) : null}
    </PageShell>
  );
}
