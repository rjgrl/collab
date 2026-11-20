import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { formatDisplayName } from "@Alumni-Tracking-Ss/contracts/names";
import { api, client, queryClient } from "@/lib/api";
import { PageHeader, PageShell } from "@/components/layout/page";
import { DataTable, TableCell, TableRow, QuietButton } from "@/components/data/data-table";
import { TablePagination } from "@/components/data/table-pagination";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { useConfirm } from "@/components/feedback/confirm-provider";
import { can, useSession } from "@/lib/session";

export const Route = createFileRoute("/_app/archive")({ component: ArchivePage });
function ArchivePage() {
  const session = useSession();
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const archived = useQuery(
    api.alumni.archived.queryOptions({ input: { page, pageSize: 20, search } }),
  );
  const restore = useMutation({
    mutationFn: (id: string) => client.alumni.restore({ id }),
    onSuccess: async () => {
      toast.success("Alumni profile restored");
      await queryClient.invalidateQueries();
    },
  });
  return (
    <PageShell>
      <PageHeader
        title="Archive"
        description="Review and restore archived alumni profiles. No records are permanently deleted here."
      />
      {archived.error ? (
        <ErrorAlert onRetry={() => void archived.refetch()}>{archived.error.message}</ErrorAlert>
      ) : null}
      {restore.error ? <ErrorAlert>{restore.error.message}</ErrorAlert> : null}
      <DataTable
        label="Archived Alumni"
        headers={["Name", "Student Number", "Archived", "Actions"]}
        loading={archived.isPending}
        isEmpty={archived.data?.total === 0}
        emptyTitle="No archived alumni"
        emptyDescription="Archived alumni profiles will appear here."
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
      >
        {archived.data?.items.map((record) => (
          <TableRow key={record.id}>
            <TableCell>{formatDisplayName(record)}</TableCell>
            <TableCell>{record.studentNumber}</TableCell>
            <TableCell>{new Date(record.deletedAt).toLocaleDateString()}</TableCell>
            <TableCell>
              {can(session.data?.permissions, "alumni.write") ? (
                <QuietButton
                  disabled={restore.isPending}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: `Restore ${formatDisplayName(record)}?`,
                        description: "This profile will return to the active Alumni directory.",
                        confirmLabel: "Restore",
                      })
                    )
                      restore.mutate(record.id);
                  }}
                >
                  Restore<span className="sr-only"> {formatDisplayName(record)}</span>
                </QuietButton>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
      <TablePagination
        page={page}
        onPage={setPage}
        pending={archived.isFetching}
        hasNext={page * 20 < (archived.data?.total ?? 0)}
      />
    </PageShell>
  );
}
