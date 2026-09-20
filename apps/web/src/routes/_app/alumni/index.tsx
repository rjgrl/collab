import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { DataTable, QuietButton, TableCell, TableRow } from "@/components/data-table";
import { PageHeader, PrimaryButton } from "@/components/page-header";
import { can, useSession } from "@/lib/session";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/alumni/")({
  component: AlumniPage,
});

function AlumniPage() {
  const session = useSession();
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [tracked, setTracked] = useState<"all" | "tracked" | "untracked">("all");
  const departments = useQuery(orpc.departments.list.queryOptions({ input: {} }));
  const list = useQuery(
    orpc.alumni.list.queryOptions({
      input: {
        search,
        departmentId: departmentId || undefined,
        tracked,
      },
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Alumni profiles"
        description="Student details, contact info, employment, tracking, and program attachment."
        actions={
          can(session.data?.permissions, "alumni.write") ? (
            <PrimaryButton nativeButton={false} render={<Link to="/alumni/new" />}>
              Add alumni
            </PrimaryButton>
          ) : null
        }
      />
      <div className="flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, student number, or email"
          className="max-w-sm"
        />
        <select
          className="h-8 border border-input bg-transparent px-2 text-xs"
          value={departmentId}
          onChange={(event) => setDepartmentId(event.target.value)}
        >
          <option value="">All departments</option>
          {departments.data?.map((department) => (
            <option key={department.id} value={department.id}>
              {department.code}
            </option>
          ))}
        </select>
        <select
          className="h-8 border border-input bg-transparent px-2 text-xs"
          value={tracked}
          onChange={(event) => setTracked(event.target.value as typeof tracked)}
        >
          <option value="all">All tracking</option>
          <option value="tracked">Tracked</option>
          <option value="untracked">Untracked</option>
        </select>
      </div>
      <DataTable headers={["Student #", "Name", "Program", "Contact", "Tracked", ""]}>
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
              <div className="flex flex-col text-xs">
                <span>{row.mobileNumber || "—"}</span>
                <span>{row.personalEmail || "—"}</span>
              </div>
            </TableCell>
            <TableCell>{row.isTracked ? "Yes" : "No"}</TableCell>
            <TableCell>
              <QuietButton nativeButton={false} render={<Link to="/alumni/$id" params={{ id: row.id }} />}>
                Open
              </QuietButton>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </div>
  );
}
