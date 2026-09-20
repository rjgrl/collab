import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/audit")({
  component: AuditPage,
});

function AuditPage() {
  const [search, setSearch] = useState("");
  const logs = useQuery(orpc.audit.list.queryOptions({ input: { search } }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit log"
        description="Recorded account, alumni, and integration actions."
      />
      <DataTable
        headers={["When", "Actor", "Action", "Summary"]}
        search={search}
        onSearch={setSearch}
      >
        {logs.data?.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{new Date(row.createdAt).toLocaleString()}</TableCell>
            <TableCell>{row.actor?.email ?? "system"}</TableCell>
            <TableCell>{row.action}</TableCell>
            <TableCell>{row.summary}</TableCell>
          </TableRow>
        ))}
      </DataTable>
    </div>
  );
}
