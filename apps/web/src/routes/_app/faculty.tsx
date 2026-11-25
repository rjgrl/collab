import { TablePagination } from "@/components/data/table-pagination";
import type { PageSize } from "@/components/data/page-controls";
import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import {
  FACULTY_LEVEL_LABELS,
  FACULTY_LEVELS,
  type FacultyLevel,
} from "@Alumni-Tracking-Ss/contracts/faculty";
import { formatDisplayName, isAdministrator } from "@Alumni-Tracking-Ss/contracts/names";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  DataTable,
  QuietButton,
  RowActions,
  TableCell,
  TableRow,
} from "@/components/data/data-table";
import { FormSelect } from "@/components/forms/form-select";
import { FilterBar } from "@/components/data/filter-bar";
import { FormField, PrimaryButton } from "@/components/forms/form-layout";
import { PageHeader, PageShell } from "@/components/layout/page";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { StatusBadge } from "@/components/data/status-badge";
import { useDepartmentOptions } from "@/lib/academic-options";
import { can, managesFaculty, useSession } from "@/lib/session";
import { client, api, queryClient } from "@/lib/api";
import { useConfirm } from "@/components/feedback/confirm-provider";

export const Route = createFileRoute("/_app/faculty")({
  component: FacultyPage,
});

type Draft = {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeNumber: string;
  departmentId: string;
  roleLevel: FacultyLevel;
};
const RANK: Record<FacultyLevel, number> = { faculty: 0, department: 1, college: 2 };

function FacultyPage() {
  const confirmAction = useConfirm();
  const session = useSession();
  const user = session.data;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [status, setStatus] = useState<"" | "true" | "false">("true");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const departments = useDepartmentOptions();
  const list = useQuery(
    api.faculty.list.queryOptions({
      input: { search, page, pageSize, active: status || undefined },
    }),
  );
  const canManage = managesFaculty(user);
  const canReadAlumni = can(user?.permissions, "alumni.read");
  // shortcut: totals cover the faculty on this page only; add a server aggregate if a
  // university-wide figure is needed.
  const pageTotals = (list.data ?? []).reduce(
    (sum, row) => ({
      assigned: sum.assigned + row.assignedCount,
      tracked: sum.tracked + row.trackedCount,
    }),
    { assigned: 0, tracked: 0 },
  );
  const admin = user ? isAdministrator(user) : false;

  // The server enforces the same limits; these only keep impossible choices out of the form.
  const ownDepartment = departments.data?.find((d) => d.id === user?.faculty?.departmentId);
  const departmentChoices = useMemo(
    () =>
      (departments.data ?? []).filter((d) =>
        admin
          ? true
          : user?.faculty?.roleLevel === "college"
            ? d.collegeId === ownDepartment?.collegeId
            : d.id === user?.faculty?.departmentId,
      ),
    [departments.data, admin, user?.faculty, ownDepartment?.collegeId],
  );
  const levelChoices = FACULTY_LEVELS.filter((level) =>
    admin ? true : user?.faculty ? RANK[level] < RANK[user.faculty.roleLevel] : false,
  );

  const save = useMutation({
    mutationFn: (value: Draft) =>
      value.id
        ? client.faculty.update({
            id: value.id,
            firstName: value.firstName,
            lastName: value.lastName,
            employeeNumber: value.employeeNumber,
            departmentId: value.departmentId,
            roleLevel: value.roleLevel,
          })
        : client.faculty.create({
            firstName: value.firstName,
            lastName: value.lastName,
            email: value.email,
            employeeNumber: value.employeeNumber,
            departmentId: value.departmentId,
            roleLevel: value.roleLevel,
          }),
    onSuccess: async () => {
      toast.success("Faculty saved");
      setDraft(null);
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });
  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      client.faculty.update({ id, active }),
    onSuccess: async (_data, variables) => {
      toast.success(variables.active ? "Faculty reactivated" : "Faculty deactivated");
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <PageShell>
      <PageHeader
        title="Faculty"
        description="Faculty trackers and heads. Deactivating a member unassigns their alumni and flags them for reassignment."
        actions={
          canManage ? (
            <PrimaryButton
              onClick={() =>
                setDraft({
                  firstName: "",
                  lastName: "",
                  email: "",
                  employeeNumber: "",
                  departmentId: departmentChoices[0]?.id ?? "",
                  roleLevel: "faculty",
                })
              }
            >
              Add Faculty
            </PrimaryButton>
          ) : null
        }
      />
      {draft ? (
        <FormDialog
          open
          onOpenChange={(open) => {
            if (!open) setDraft(null);
          }}
          pending={save.isPending}
          footer={
            <div className="flex gap-2">
              <PrimaryButton type="submit" form="faculty-form" pending={save.isPending}>
                Save
              </PrimaryButton>
              <QuietButton type="button" disabled={save.isPending} onClick={() => setDraft(null)}>
                Cancel
              </QuietButton>
            </div>
          }
          title={draft.id ? "Edit Faculty" : "Add Faculty"}
        >
          <form
            id="faculty-form"
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate(draft);
            }}
          >
            <FormField id="faculty-first" label="First Name" required>
              <Input
                id="faculty-first"
                value={draft.firstName}
                onChange={(event) => setDraft({ ...draft, firstName: event.target.value })}
                required
              />
            </FormField>
            <FormField id="faculty-last" label="Last Name" required>
              <Input
                id="faculty-last"
                value={draft.lastName}
                onChange={(event) => setDraft({ ...draft, lastName: event.target.value })}
                required
              />
            </FormField>
            {draft.id ? null : (
              <FormField id="faculty-email" label="Institutional Email" required>
                <Input
                  id="faculty-email"
                  type="email"
                  value={draft.email}
                  onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                  required
                />
              </FormField>
            )}
            <FormField id="faculty-employee" label="Employee Number" required>
              <Input
                id="faculty-employee"
                value={draft.employeeNumber}
                onChange={(event) => setDraft({ ...draft, employeeNumber: event.target.value })}
                required
              />
            </FormField>
            <FormField id="faculty-department" label="Department" required>
              <FormSelect
                id="faculty-department"
                value={draft.departmentId}
                onValueChange={(selected) => setDraft({ ...draft, departmentId: selected })}
                required
                items={[
                  { value: "", label: "Select Department" },
                  ...departmentChoices.map((d) => ({ value: d.id, label: d.name })),
                ]}
              />
            </FormField>
            <FormField id="faculty-level" label="Role Level" required>
              <FormSelect
                id="faculty-level"
                value={draft.roleLevel}
                onValueChange={(selected) =>
                  setDraft({ ...draft, roleLevel: selected as FacultyLevel })
                }
                required
                items={levelChoices.map((level) => ({
                  value: level,
                  label: FACULTY_LEVEL_LABELS[level],
                }))}
              />
            </FormField>
          </form>
        </FormDialog>
      ) : null}
      {viewing ? <AssignedAlumniDialog viewing={viewing} onClose={() => setViewing(null)} /> : null}
      {list.isError ? (
        <ErrorAlert onRetry={() => void list.refetch()}>{list.error.message}</ErrorAlert>
      ) : null}
      <DataTable
        label="Faculty Members"
        headers={[
          "Name",
          "Department",
          "Role Level",
          "Assigned",
          `Tracked ${percent(pageTotals.tracked, pageTotals.assigned)}%`,
          `Untracked ${percent(pageTotals.assigned - pageTotals.tracked, pageTotals.assigned)}%`,
          "Status",
          "Actions",
        ]}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search name, email, or employee number"
        toolbar={
          <FilterBar>
            <FormSelect
              className="w-full sm:w-auto sm:min-w-36"
              value={status}
              onValueChange={(selected) => {
                setStatus(selected as typeof status);
                setPage(1);
              }}
              aria-label="Status"
              items={[
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
                { value: "", label: "All Statuses" },
              ]}
            />
          </FilterBar>
        }
        loading={list.isPending}
        isEmpty={list.data?.length === 0}
        emptyTitle="No Faculty Found"
        emptyDescription="Add faculty members to assign them alumni to track."
      >
        {list.data?.map((row) => {
          const editable =
            canManage &&
            (admin ||
              (user?.faculty !== null &&
                user?.faculty !== undefined &&
                RANK[row.roleLevel] < RANK[user.faculty.roleLevel]));
          return (
            <TableRow key={row.id}>
              <TableCell>
                <div className="font-medium">
                  {row.firstName} {row.lastName}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {row.email ?? "No sign-in account"} · {row.employeeNumber}
                </div>
              </TableCell>
              <TableCell>{row.department?.name ?? "Unplaced"}</TableCell>
              <TableCell>{FACULTY_LEVEL_LABELS[row.roleLevel]}</TableCell>
              <TableCell className="text-right tabular-nums">{row.assignedCount}</TableCell>
              <TableCell>
                {canReadAlumni ? (
                  <QuietButton
                    aria-label={`View alumni assigned to ${row.firstName} ${row.lastName}`}
                    disabled={row.assignedCount === 0}
                    onClick={() => setViewing({ ...row, untrackedOnly: false })}
                  >
                    View Alumni
                  </QuietButton>
                ) : null}
              </TableCell>
              <TableCell>
                {canReadAlumni ? (
                  <QuietButton
                    aria-label={`View untracked alumni assigned to ${row.firstName} ${row.lastName}`}
                    disabled={row.assignedCount === row.trackedCount}
                    onClick={() => setViewing({ ...row, untrackedOnly: true })}
                  >
                    View Untracked
                  </QuietButton>
                ) : null}
              </TableCell>
              <TableCell>{row.active ? "Active" : "Inactive"}</TableCell>
              <TableCell>
                <RowActions>
                  {editable ? (
                    <QuietButton
                      onClick={() =>
                        setDraft({
                          id: row.id,
                          firstName: row.firstName,
                          lastName: row.lastName,
                          email: row.email ?? "",
                          employeeNumber: row.employeeNumber,
                          departmentId: row.departmentId ?? "",
                          roleLevel: row.roleLevel,
                        })
                      }
                    >
                      Edit
                    </QuietButton>
                  ) : null}
                  {editable ? (
                    <QuietButton
                      variant={row.active ? "destructive" : undefined}
                      disabled={setActive.isPending}
                      onClick={async () => {
                        if (
                          !row.active ||
                          (await confirmAction({
                            title: `Deactivate ${row.firstName} ${row.lastName}?`,
                            description: `Their ${row.assignedCount} assigned alumni will be unassigned and flagged for reassignment.`,
                            confirmLabel: "Deactivate",
                            destructive: true,
                          }))
                        )
                          setActive.mutate({ id: row.id, active: !row.active });
                      }}
                    >
                      {row.active ? "Deactivate" : "Reactivate"}
                    </QuietButton>
                  ) : null}
                </RowActions>
              </TableCell>
            </TableRow>
          );
        })}
      </DataTable>
      <TablePagination
        page={page}
        onPage={setPage}
        hasNext={list.data?.length === pageSize}
        pageSize={pageSize}
        onPageSize={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        pending={list.isFetching}
      />
    </PageShell>
  );
}

type Viewing = {
  id: string;
  firstName: string;
  lastName: string;
  assignedCount: number;
  trackedCount: number;
  untrackedOnly: boolean;
};

const percent = (count: number, total: number) => (total ? Math.round((count / total) * 100) : 0);

function AssignedAlumniDialog({ viewing, onClose }: { viewing: Viewing; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const alumni = useQuery(
    api.alumni.list.queryOptions({
      input: {
        assignedFacultyId: viewing.id,
        tracked: viewing.untrackedOnly ? "untracked" : undefined,
        page,
        pageSize,
      },
    }),
  );
  const name = `${viewing.firstName} ${viewing.lastName}`;
  const untracked = viewing.assignedCount - viewing.trackedCount;
  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`${viewing.untrackedOnly ? "Untracked Alumni" : "Alumni"} Assigned to ${name}`}
      footer={
        <dl
          aria-label="Assignment Summary"
          className="mr-auto flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums"
        >
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Assigned</dt>
            <dd className="font-medium">{viewing.assignedCount}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Tracked</dt>
            <dd className="font-medium">
              {viewing.trackedCount} ({percent(viewing.trackedCount, viewing.assignedCount)}%)
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Untracked</dt>
            <dd className="font-medium">
              {untracked} ({percent(untracked, viewing.assignedCount)}%)
            </dd>
          </div>
        </dl>
      }
    >
      <div className="grid gap-4">
        {alumni.isError ? (
          <ErrorAlert onRetry={() => void alumni.refetch()}>{alumni.error.message}</ErrorAlert>
        ) : null}
        <DataTable
          label={viewing.untrackedOnly ? "Untracked Assigned Alumni" : "Assigned Alumni"}
          headers={["Name", "Student Number", "Program", "Graduation Year", "Status", "Actions"]}
          loading={alumni.isPending}
          isEmpty={alumni.data?.length === 0}
          emptyTitle={viewing.untrackedOnly ? "No Untracked Alumni" : "No Assigned Alumni"}
          emptyDescription={
            viewing.untrackedOnly
              ? "Every alumnus assigned to this faculty member is tracked."
              : "No alumni are assigned to this faculty member."
          }
        >
          {alumni.data?.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{formatDisplayName(row)}</TableCell>
              <TableCell>{row.studentNumber}</TableCell>
              <TableCell>{row.program.name}</TableCell>
              <TableCell className="tabular-nums">{row.graduationYear ?? "—"}</TableCell>
              <TableCell>
                <StatusBadge tone={row.isTracked ? "tracked" : "untracked"} />
              </TableCell>
              <TableCell>
                <QuietButton
                  nativeButton={false}
                  render={<Link to="/alumni/$id" params={{ id: row.id }} />}
                >
                  View Profile
                </QuietButton>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
        <TablePagination
          label="Assigned Alumni Pagination"
          page={page}
          onPage={setPage}
          hasNext={alumni.data?.length === pageSize}
          pageSize={pageSize}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          pending={alumni.isFetching}
        />
      </div>
    </FormDialog>
  );
}
