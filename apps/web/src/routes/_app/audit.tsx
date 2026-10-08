import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { PageHeader, PageShell } from "@/components/page-header";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/audit")({
  component: AuditPage,
});

function AuditPage() {
  const [search, setSearch] = useState("");
  const logs = useQuery(orpc.audit.list.queryOptions({ input: { search } }));

  return (
    <PageShell>
      <PageHeader title="Audit log" description="Recorded account, alumni, and integration actions." />
      <DataTable
        headers={["When", "Actor", "Action", "Summary"]}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search audit log"
        loading={logs.isPending}
        isEmpty={logs.data?.length === 0}
        emptyTitle="No audit events found"
        emptyDescription="Actions such as sign-in, alumni updates, and imports appear here."
      >
        {logs.data?.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{new Date(row.createdAt).toLocaleString()}</TableCell>
            <TableCell>{row.actor?.email ?? "System"}</TableCell>
            <TableCell>{row.action}</TableCell>
            <TableCell>{row.summary}</TableCell>
          </TableRow>
        ))}
      </DataTable>
    </PageShell>
  );
}
