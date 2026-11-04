import { TablePagination } from "@/components/table-pagination";
import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import {
  FACULTY_LEVEL_LABELS,
  FACULTY_LEVELS,
  type FacultyLevel,
} from "@Alumni-Tracking-Ss/contracts/faculty";
import { isAdministrator } from "@Alumni-Tracking-Ss/contracts/names";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DataTable, QuietButton, RowActions, TableCell, TableRow } from "@/components/data-table";
import { FormSelect } from "@/components/form-select";
import {
  FilterBar,
  FormField,
  PageHeader,
  PageShell,
  PrimaryButton,
} from "@/components/page-header";
import { useDepartmentOptions } from "@/lib/academic-options";
import { managesFaculty, useSession } from "@/lib/session";
import { client, api, queryClient } from "@/utils/api";

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
  const session = useSession();
  const user = session.data;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"" | "true" | "false">("true");
  const [draft, setDraft] = useState<Draft | null>(null);
  const departments = useDepartmentOptions();
  const list = useQuery(
    api.faculty.list.queryOptions({
      input: { search, page, pageSize: 20, active: status || undefined },
    }),
  );
  const canManage = managesFaculty(user);
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
              Add faculty
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
          title={draft.id ? "Edit faculty" : "Add faculty"}
        >
          <form
            id="faculty-form"
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate(draft);
            }}
          >
            <FormField id="faculty-first" label="First name" required>
              <Input
                id="faculty-first"
                value={draft.firstName}
                onChange={(event) => setDraft({ ...draft, firstName: event.target.value })}
                required
              />
            </FormField>
            <FormField id="faculty-last" label="Last name" required>
              <Input
                id="faculty-last"
                value={draft.lastName}
                onChange={(event) => setDraft({ ...draft, lastName: event.target.value })}
                required
              />
            </FormField>
            {draft.id ? null : (
              <FormField id="faculty-email" label="Institutional email" required>
                <Input
                  id="faculty-email"
                  type="email"
                  value={draft.email}
                  onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                  required
                />
              </FormField>
            )}
            <FormField id="faculty-employee" label="Employee number" required>
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
                  { value: "", label: "Select department" },
                  ...departmentChoices.map((d) => ({ value: d.id, label: d.name })),
                ]}
              />
            </FormField>
            <FormField id="faculty-level" label="Role level" required>
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
      {list.isError ? (
        <p role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
          {list.error.message}
          <QuietButton onClick={() => void list.refetch()}>Retry</QuietButton>
        </p>
      ) : null}
      <DataTable
        label="Faculty members"
        headers={["Name", "Department", "Role level", "Assigned", "Status", "Actions"]}
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
                { value: "", label: "All statuses" },
              ]}
            />
          </FilterBar>
        }
        loading={list.isPending}
        isEmpty={list.data?.length === 0}
        emptyTitle="No faculty found"
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
                      onClick={() => {
                        if (
                          !row.active ||
                          confirm(
                            `Deactivate ${row.firstName} ${row.lastName}? Their ${row.assignedCount} assigned alumni will be unassigned and flagged for reassignment.`,
                          )
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
        hasNext={list.data?.length === 20}
        pending={list.isFetching}
      />
    </PageShell>
  );
}
