import { useDepartmentOptions } from "@/lib/academic-options";
import { formatDisplayName } from "@Alumni-Tracking-Ss/contracts/names";
import { TablePagination } from "@/components/table-pagination";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { DataTable, QuietButton, RowActions, TableCell, TableRow } from "@/components/data-table";
import { FormSelect } from "@/components/form-select";
import {
  FilterBar,
  FormField,
  PageHeader,
  PageShell,
  PrimaryButton,
} from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { can, canAssignFaculty, useSession } from "@/lib/session";
import { Checkbox } from "@Alumni-Tracking-Ss/ui/components/checkbox";
import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
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
  const isFaculty = Boolean(session.data?.faculty);
  const [assignment, setAssignment] = useState<
    "all" | "mine" | "unassigned" | "needs_reassignment"
  >("all");
  const [selected, setSelected] = useState<string[]>([]);
  // Alumni ids the picker dialog will assign; null while the dialog is closed.
  const [assigning, setAssigning] = useState<string[] | null>(null);
  const [facultyId, setFacultyId] = useState("");
  const assigner = canAssignFaculty(session.data);
  const facultyOptions = useQuery({
    ...api.faculty.list.queryOptions({ input: { active: "true", page: 1, pageSize: 100 } }),
    enabled: assigner && assigning !== null,
  });
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
        assignment,
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

  const assign = useMutation({
    mutationFn: (value: { alumniIds: string[]; facultyId: string | null }) =>
      client.faculty.assign(value),
    onSuccess: async (result, value) => {
      toast.success(
        value.facultyId
          ? `Assigned ${result.updated} alumni`
          : `Unassigned ${result.updated} alumni`,
      );
      setAssigning(null);
      setSelected([]);
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });
  const pageIds = list.data?.map((row) => row.id) ?? [];
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  return (
    <PageShell>
      {assigning ? (
        <FormDialog
          open
          onOpenChange={(open) => {
            if (!open) setAssigning(null);
          }}
          pending={assign.isPending}
          title={
            assigning.length === 1
              ? "Assign faculty"
              : `Assign faculty to ${assigning.length} alumni`
          }
          footer={
            <div className="flex flex-wrap gap-2">
              <PrimaryButton type="submit" form="assign-form" pending={assign.isPending}>
                Assign
              </PrimaryButton>
              <QuietButton
                type="button"
                disabled={assign.isPending}
                onClick={() => assign.mutate({ alumniIds: assigning, facultyId: null })}
              >
                Unassign
              </QuietButton>
              <QuietButton
                type="button"
                disabled={assign.isPending}
                onClick={() => setAssigning(null)}
              >
                Cancel
              </QuietButton>
            </div>
          }
        >
          <form
            id="assign-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (facultyId) assign.mutate({ alumniIds: assigning, facultyId });
            }}
          >
            <FormField id="assign-faculty" label="Faculty tracker" required>
              <FormSelect
                id="assign-faculty"
                value={facultyId}
                onValueChange={setFacultyId}
                required
                items={[
                  {
                    value: "",
                    label: facultyOptions.isPending ? "Loading faculty…" : "Select faculty",
                  },
                  ...(facultyOptions.data?.map((f) => ({
                    value: f.id,
                    label: `${f.firstName} ${f.lastName} · ${f.department?.name ?? "Unplaced"}`,
                  })) ?? []),
                ]}
              />
            </FormField>
            {facultyOptions.isError ? (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {facultyOptions.error.message}
              </p>
            ) : null}
          </form>
        </FormDialog>
      ) : null}
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
        headers={[
          ...(assigner ? ["Select"] : []),
          "Student #",
          "Name",
          "Program",
          "Contact",
          "Tracking",
          "Assigned to",
          "Actions",
        ]}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
          setPendingPage(1);
        }}
        searchPlaceholder="Search name, student number, or email"
        toolbar={
          <FilterBar>
            {assigner && selected.length ? (
              <PrimaryButton
                onClick={() => {
                  setFacultyId("");
                  setAssigning(selected);
                }}
              >
                Assign {selected.length} selected
              </PrimaryButton>
            ) : null}
            {assigner ? (
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(value) =>
                    setSelected(
                      value === true
                        ? [...new Set([...selected, ...pageIds])]
                        : selected.filter((id) => !pageIds.includes(id)),
                    )
                  }
                />
                Select page
              </label>
            ) : null}
            <FormSelect
              className="w-full sm:w-auto sm:min-w-40"
              value={assignment}
              onValueChange={(value) => {
                setAssignment(value as typeof assignment);
                setPage(1);
              }}
              aria-label="Assignment"
              items={[
                { value: "all", label: "All assignments" },
                ...(isFaculty ? [{ value: "mine", label: "My assigned alumni" }] : []),
                { value: "unassigned", label: "Unassigned" },
                { value: "needs_reassignment", label: "Needs reassignment" },
              ]}
            />
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
            {assigner ? (
              <TableCell>
                <Checkbox
                  aria-label={`Select ${formatDisplayName(row)}`}
                  checked={selected.includes(row.id)}
                  onCheckedChange={(value) =>
                    setSelected(
                      value === true
                        ? [...selected, row.id]
                        : selected.filter((id) => id !== row.id),
                    )
                  }
                />
              </TableCell>
            ) : null}
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
                <span>
                  {row.contacts.find((c) => c.type === "phone")?.value || row.mobileNumber || "—"}
                </span>
                <span>
                  {row.contacts.find((c) => c.type === "email")?.value || row.personalEmail || "—"}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <StatusBadge tone={row.isTracked ? "tracked" : "untracked"} />
            </TableCell>
            <TableCell>
              <div className="min-w-28 text-sm">{row.assignedFaculty?.name ?? "Unassigned"}</div>
              {row.needsReassignment ? (
                <div className="mt-1 text-xs text-muted-foreground">Needs reassignment</div>
              ) : null}
            </TableCell>
            <TableCell>
              <RowActions>
                {assigner ? (
                  <QuietButton
                    aria-label={`Assign faculty to ${formatDisplayName(row)}`}
                    onClick={() => {
                      setFacultyId(row.assignedFacultyId ?? "");
                      setAssigning([row.id]);
                    }}
                  >
                    Assign faculty
                  </QuietButton>
                ) : null}
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
