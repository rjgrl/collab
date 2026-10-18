import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { CheckboxRow } from "@/components/checkbox-row";
import { DataTable, QuietButton, RowActions, TableCell, TableRow } from "@/components/data-table";
import {
  FieldsetLabel,
  FormActions,
  FormCard,
  FormField,
  PageHeader,
  PageShell,
  PrimaryButton,
} from "@/components/page-header";
import { can, useSession } from "@/lib/session";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_app/faculties")({
  component: FacultiesPage,
});

type Draft = {
  id?: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  departmentIds: string[];
};

function FacultiesPage() {
  const session = useSession();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const departments = useQuery(orpc.departments.list.queryOptions({ input: {} }));
  const list = useQuery(orpc.faculties.list.queryOptions({ input: { search } }));
  const canWrite = can(session.data?.permissions, "faculties.write");
  const canDelete = can(session.data?.permissions, "faculties.delete");

  const save = useMutation({
    mutationFn: (value: Draft) =>
      value.id
        ? client.faculties.update({ ...value, id: value.id })
        : client.faculties.create(value),
    onSuccess: async () => {
      toast.success("Faculty saved");
      setDraft(null);
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => client.faculties.delete({ id }),
    onSuccess: async () => {
      toast.success("Faculty removed");
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <PageShell>
      <PageHeader
        title="Faculties"
        description="Faculties can be added to one or more departments."
        actions={
          canWrite ? (
            <PrimaryButton
              onClick={() =>
                setDraft({
                  employeeNumber: "",
                  firstName: "",
                  lastName: "",
                  email: "",
                  departmentIds: [],
                })
              }
            >
              Add faculty
            </PrimaryButton>
          ) : null
        }
      />
      {draft ? (
        <FormCard title={draft.id ? "Edit faculty" : "Add faculty"}>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate(draft);
            }}
          >
            <FormField id="employeeNumber" label="Employee number" required>
              <Input
                id="employeeNumber"
                value={draft.employeeNumber}
                onChange={(event) => setDraft({ ...draft, employeeNumber: event.target.value })}
                required
              />
            </FormField>
            <FormField id="email" label="Email">
              <Input
                id="email"
                type="email"
                value={draft.email}
                onChange={(event) => setDraft({ ...draft, email: event.target.value })}
              />
            </FormField>
            <FormField id="firstName" label="First name" required>
              <Input
                id="firstName"
                value={draft.firstName}
                onChange={(event) => setDraft({ ...draft, firstName: event.target.value })}
                required
              />
            </FormField>
            <FormField id="lastName" label="Last name" required>
              <Input
                id="lastName"
                value={draft.lastName}
                onChange={(event) => setDraft({ ...draft, lastName: event.target.value })}
                required
              />
            </FormField>
            <div className="flex flex-col gap-2 md:col-span-2">
              <FieldsetLabel>Departments</FieldsetLabel>
              {departments.data?.map((department) => (
                <CheckboxRow
                  key={department.id}
                  checked={draft.departmentIds.includes(department.id)}
                  onCheckedChange={(checked) =>
                    setDraft({
                      ...draft,
                      departmentIds: checked
                        ? [...draft.departmentIds, department.id]
                        : draft.departmentIds.filter((id) => id !== department.id),
                    })
                  }
                >
                  {department.code} — {department.name}
                </CheckboxRow>
              ))}
            </div>
            <FormActions>
              <PrimaryButton type="submit" pending={save.isPending}>
                Save
              </PrimaryButton>
              <QuietButton type="button" onClick={() => setDraft(null)}>
                Cancel
              </QuietButton>
            </FormActions>
          </form>
        </FormCard>
      ) : null}
      <DataTable
        headers={["Employee #", "Name", "Departments", "Actions"]}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search faculties"
        loading={list.isPending}
        isEmpty={list.data?.length === 0}
        emptyTitle="No faculties found"
        emptyDescription="Add a faculty record and assign it to a department."
      >
        {list.data?.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.employeeNumber}</TableCell>
            <TableCell>
              {row.lastName}, {row.firstName}
            </TableCell>
            <TableCell>
              {row.facultyDepartments.map((item) => item.department.code).join(", ") || "—"}
            </TableCell>
            <TableCell>
              <RowActions>
                {canWrite ? (
                  <QuietButton
                    onClick={() =>
                      setDraft({
                        id: row.id,
                        employeeNumber: row.employeeNumber,
                        firstName: row.firstName,
                        lastName: row.lastName,
                        email: row.email ?? "",
                        departmentIds: row.facultyDepartments.map((item) => item.departmentId),
                      })
                    }
                  >
                    Edit
                  </QuietButton>
                ) : null}
                {canDelete ? (
                  <QuietButton
                    variant="destructive"
                    onClick={() => {
                      if (confirm("Remove this faculty record? This cannot be undone.")) {
                        remove.mutate(row.id);
                      }
                    }}
                  >
                    Remove
                  </QuietButton>
                ) : null}
              </RowActions>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </PageShell>
  );
}
