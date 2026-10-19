import { AlumniCreateDialog } from "@/components/alumni-create-dialog";
import { TablePagination } from "@/components/table-pagination";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { DataTable, QuietButton, RowActions, TableCell, TableRow } from "@/components/data-table";
import { NativeSelect } from "@/components/native-select";
import { FilterBar, PageHeader, PageShell, PrimaryButton } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { can, useSession } from "@/lib/session";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/alumni/")({
  component: AlumniPage,
});

function AlumniPage() {
  const session = useSession();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [departmentId, setDepartmentId] = useState("");
  const [tracked, setTracked] = useState<"all" | "tracked" | "untracked">("all");
  const departments = useQuery(orpc.departments.list.queryOptions({ input: {} }));
  const list = useQuery(
    orpc.alumni.list.queryOptions({
      input: {
        search,
        departmentId: departmentId || undefined,
        tracked,
        page,
        pageSize: 20,
      },
    }),
  );

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
      <DataTable
        headers={["Student #", "Name", "Program", "Contact", "Tracking", "Actions"]}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
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
                  {department.code}
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
              {row.lastName}, {row.firstName}
            </TableCell>
            <TableCell>
              {row.program.department.code} / {row.program.code}
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
              </RowActions>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
      <TablePagination
        page={page}
        onPage={setPage}
        hasNext={list.data?.length === 20}
        pending={list.isFetching}
      />
    </PageShell>
  );
}
