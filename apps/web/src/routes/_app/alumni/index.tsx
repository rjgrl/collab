import { useDepartmentOptions } from "@/lib/academic-options";
import { formatDisplayName } from "@Alumni-Tracking-Ss/contracts/names";
import { TablePagination } from "@/components/table-pagination";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { DataTable, QuietButton, RowActions, TableCell, TableRow } from "@/components/data-table";
import { FormSelect } from "@/components/form-select";
import { FilterBar, PageHeader, PageShell } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { can, useSession } from "@/lib/session";
import { toast } from "sonner";
import { api, client, queryClient } from "@/utils/api";

export const Route = createFileRoute("/_app/alumni/")({
  component: AlumniPage,
});

function AlumniPage() {
  const session = useSession();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const [departmentId, setDepartmentId] = useState("");
  const [tracked, setTracked] = useState<"all" | "tracked" | "untracked">("all");
  const departments = useDepartmentOptions();
  const pendingAccounts = useQuery(
    api.alumni.pendingAccounts.queryOptions({
      input: { search, page: pendingPage, pageSize: 20 },
    }),
  );
  const list = useQuery(
    api.alumni.list.queryOptions({
      input: {
        search,
        departmentId: departmentId || undefined,
        tracked,
        page,
        pageSize: 20,
      },
    }),
  );

  const archive = useMutation({
    mutationFn: (id: string) => client.alumni.delete({ id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      toast.success("Alumni profile archived");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <PageShell>
      <PageHeader
        title="Alumni"
        description="Alumni self-register to create their account and profile. Manage registered profiles, employment, and tracking here."
      />
      {list.isError ? (
        <p role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
          {list.error.message}{" "}
          <QuietButton onClick={() => void list.refetch()}>Retry alumni</QuietButton>
        </p>
      ) : null}
      <DataTable
        label="Alumni registry profiles"
        headers={["Student #", "Name", "Program", "Contact", "Tracking", "Actions"]}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
          setPendingPage(1);
        }}
        searchPlaceholder="Search name, student number, or email"
        toolbar={
          <FilterBar>
            <FormSelect
              className="w-full sm:w-auto sm:min-w-40"
              value={departmentId}
              onValueChange={(selected) => {
                setDepartmentId(selected);
                setPage(1);
              }}
              aria-label="Department"
              items={[
                { value: "", label: "All departments" },
                ...(departments.data?.map((department) => ({
                  value: department.id,
                  label: department.name,
                })) ?? []),
              ]}
            />
            <FormSelect
              className="w-full sm:w-auto sm:min-w-36"
              value={tracked}
              onValueChange={(selected) => {
                setTracked(selected as typeof tracked);
                setPage(1);
              }}
              aria-label="Tracking"
              items={[
                { value: "all", label: "All tracking" },
                { value: "tracked", label: "Tracked" },
                { value: "untracked", label: "Untracked" },
              ]}
            />
          </FilterBar>
        }
        loading={list.isPending}
        isEmpty={list.data?.length === 0}
        emptyTitle="No alumni found"
        emptyDescription="Alumni profiles appear after self-registration or an approved import."
      >
        {list.data?.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <span className="whitespace-nowrap tabular-nums">{row.studentNumber}</span>
            </TableCell>
            <TableCell>
              <div className="min-w-36 font-medium">{formatDisplayName(row)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {row.isRegistered ? "Registered account" : "Profile only"}
              </div>
            </TableCell>
            <TableCell>
              <div className="font-medium">{row.program.code}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {row.program.department.name}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span>{row.mobileNumber || "—"}</span>
                <span>{row.personalEmail || "—"}</span>
              </div>
            </TableCell>
            <TableCell>
              <StatusBadge tone={row.isTracked ? "tracked" : "untracked"} />
            </TableCell>
            <TableCell>
              <RowActions>
                <QuietButton
                  nativeButton={false}
                  render={<Link to="/alumni/$id" params={{ id: row.id }} />}
                >
                  View profile
                </QuietButton>
                {can(session.data?.permissions, "alumni.delete") ? (
                  <QuietButton
                    disabled={archive.isPending}
                    aria-label={`Archive ${formatDisplayName(row)}`}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Archive ${formatDisplayName(row)}? The profile will leave normal lists and reports. Its account and history will be preserved.`,
                        )
                      )
                        archive.mutate(row.id);
                    }}
                  >
                    Archive
                  </QuietButton>
                ) : null}
              </RowActions>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
      <TablePagination
        label="Alumni profiles pagination"
        page={page}
        onPage={setPage}
        hasNext={list.data?.length === 20}
        pending={list.isFetching}
      />
      <section className="space-y-4 border-t pt-6" aria-labelledby="pending-alumni-heading">
        <h2 id="pending-alumni-heading" className="text-base font-semibold">
          Accounts awaiting profile completion
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          These Alumni accounts still need student and program details. They appear here until their
          owners complete their profile through their own account. They are not included in graduate
          statistics yet. Department and tracking filters apply to completed profiles above.
        </p>
        {pendingAccounts.isError ? (
          <p
            role="alert"
            className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm"
          >
            {pendingAccounts.error.message}{" "}
            <QuietButton onClick={() => void pendingAccounts.refetch()}>Retry accounts</QuietButton>
          </p>
        ) : null}
        <DataTable
          label="Alumni accounts awaiting profile completion"
          headers={["Name", "Email", "Status"]}
          loading={pendingAccounts.isPending}
          isEmpty={pendingAccounts.data?.length === 0}
          emptyTitle="No accounts awaiting profile completion"
          emptyDescription="All matching Alumni accounts have a linked registry profile."
        >
          {pendingAccounts.data?.map((account) => (
            <TableRow key={account.id}>
              <TableCell>
                <span className="font-medium">{account.name}</span>
              </TableCell>
              <TableCell>{account.email}</TableCell>
              <TableCell>
                <span className="inline-flex whitespace-nowrap rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                  Awaiting profile completion
                </span>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
        <TablePagination
          label="Pending Alumni accounts pagination"
          page={pendingPage}
          onPage={setPendingPage}
          hasNext={pendingAccounts.data?.length === 20}
          pending={pendingAccounts.isFetching}
        />
      </section>
    </PageShell>
  );
}
