import { useDepartmentOptions } from "@/lib/academic-options";
import { formatDisplayName } from "@Alumni-Tracking-Ss/contracts/names";
import { AlumniCreateDialog } from "@/components/alumni-create-dialog";
import { TablePagination } from "@/components/table-pagination";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { DataTable, QuietButton, RowActions, TableCell, TableRow } from "@/components/data-table";
import { NativeSelect } from "@/components/native-select";
import { FilterBar, PageHeader, PageShell, PrimaryButton } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { can, useSession } from "@/lib/session";
import { toast } from "sonner";
import { api, client, queryClient } from "@/utils/api";

export const Route = createFileRoute("/_app/alumni/")({
  component: AlumniPage,
});

function AlumniPage() {
  const session = useSession();
  const [creating, setCreating] = useState(false);
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
        description="Student details, contact info, employment, tracking, and program attachment."
        actions={
          can(session.data?.permissions, "alumni.write") ? (
            <PrimaryButton onClick={() => setCreating(true)}>Add alumni</PrimaryButton>
          ) : null
        }
      />
      {creating ? <AlumniCreateDialog onClose={() => setCreating(false)} /> : null}
      {list.isError ? (
        <p role="alert">
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
            <NativeSelect
              className="w-auto min-w-36"
              value={departmentId}
              onChange={(event) => {
                setDepartmentId(event.target.value);
                setPage(1);
              }}
              aria-label="Department"
            >
              <option value="">All departments</option>
              {departments.data?.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              className="w-auto min-w-36"
              value={tracked}
              onChange={(event) => {
                setTracked(event.target.value as typeof tracked);
                setPage(1);
              }}
              aria-label="Tracking"
            >
              <option value="all">All tracking</option>
              <option value="tracked">Tracked</option>
              <option value="untracked">Untracked</option>
            </NativeSelect>
          </FilterBar>
        }
        loading={list.isPending}
        isEmpty={list.data?.length === 0}
        emptyTitle="No alumni found"
        emptyDescription="Add an alumni profile and attach it to a program."
      >
        {list.data?.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.studentNumber}</TableCell>
            <TableCell>
              <div>{formatDisplayName(row)}</div>
              <div className="text-xs text-muted-foreground">
                {row.isRegistered ? "Registered account" : "Profile only"}
              </div>
            </TableCell>
            <TableCell>
              {row.program.department.name} / {row.program.code}
            </TableCell>
            <TableCell>
              <div className="flex flex-col text-xs text-muted-foreground">
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
      <section className="mt-8 space-y-3" aria-labelledby="pending-alumni-heading">
        <h2 id="pending-alumni-heading" className="text-lg font-semibold">
          Accounts awaiting profile completion
        </h2>
        <p className="text-sm text-muted-foreground">
          These Alumni accounts still need student and program details. They appear here until their
          owners complete their profile or an administrator links an existing record in Members.
          They are not included in graduate statistics yet. Department and tracking filters apply to
          completed profiles above.
        </p>
        {pendingAccounts.isError ? (
          <p role="alert">
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
              <TableCell>{account.name}</TableCell>
              <TableCell>{account.email}</TableCell>
              <TableCell>Awaiting profile completion</TableCell>
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
