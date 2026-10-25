import { TablePagination } from "@/components/table-pagination";
import { useDepartmentOptions } from "@/lib/academic-options";
import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { Textarea } from "@Alumni-Tracking-Ss/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, QuietButton, RowActions, TableCell, TableRow } from "@/components/data-table";
import { NativeSelect } from "@/components/native-select";
import { FormField, PageHeader, PageShell, PrimaryButton } from "@/components/page-header";
import { can, useSession } from "@/lib/session";
import { client, api, queryClient } from "@/utils/api";

export const Route = createFileRoute("/_app/programs")({
  component: ProgramsPage,
});

type Draft = {
  id?: string;
  code: string;
  name: string;
  description: string;
  departmentId: string;
};

function ProgramsPage() {
  const session = useSession();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const departments = useDepartmentOptions();
  const list = useQuery(api.programs.list.queryOptions({ input: { search, page, pageSize: 20 } }));
  const canWrite = can(session.data?.permissions, "programs.write");
  const canDelete = can(session.data?.permissions, "programs.delete");

  const save = useMutation({
    mutationFn: (value: Draft) =>
      value.id ? client.programs.update({ ...value, id: value.id }) : client.programs.create(value),
    onSuccess: async () => {
      toast.success("Program saved");
      setDraft(null);
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => client.programs.delete({ id }),
    onSuccess: async () => {
      toast.success("Program removed");
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <PageShell>
      <PageHeader
        title="Programs"
        description="A program is attached to one department. Alumni attach to a program."
        actions={
          canWrite ? (
            <PrimaryButton
              onClick={() =>
                setDraft({
                  code: "",
                  name: "",
                  description: "",
                  departmentId: departments.data?.[0]?.id ?? "",
                })
              }
            >
              Add program
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
              <PrimaryButton type="submit" form="academic-form" pending={save.isPending}>
                Save
              </PrimaryButton>
              <QuietButton type="button" disabled={save.isPending} onClick={() => setDraft(null)}>
                Cancel
              </QuietButton>
            </div>
          }
          title={draft.id ? "Edit program" : "Add program"}
        >
          <form
            id="academic-form"
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate(draft);
            }}
          >
            <FormField id="department" label="Department" required>
              <NativeSelect
                id="department"
                value={draft.departmentId}
                onChange={(event) => setDraft({ ...draft, departmentId: event.target.value })}
                required
              >
                <option value="">Select department</option>
                {departments.data?.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="code" label="Code" required>
              <Input
                id="code"
                value={draft.code}
                onChange={(event) => setDraft({ ...draft, code: event.target.value })}
                required
              />
            </FormField>
            <FormField id="name" label="Name" required>
              <Input
                id="name"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                required
              />
            </FormField>
            <div className="md:col-span-2">
              <FormField id="description" label="Description">
                <Textarea
                  id="description"
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              </FormField>
            </div>
          </form>
        </FormDialog>
      ) : null}
      <DataTable
        headers={["Code", "Name", "Department", "Alumni", "Actions"]}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search programs"
        loading={list.isPending}
        isEmpty={list.data?.length === 0}
        emptyTitle="No programs found"
        emptyDescription="Add a program and attach it to a department."
      >
        {list.data?.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.code}</TableCell>
            <TableCell>{row.name}</TableCell>
            <TableCell>
              {row.department.name}
            </TableCell>
            <TableCell>{row._count.alumni}</TableCell>
            <TableCell>
              <RowActions>
                {canWrite ? (
                  <QuietButton
                    onClick={() =>
                      setDraft({
                        id: row.id,
                        code: row.code,
                        name: row.name,
                        description: row.description,
                        departmentId: row.departmentId,
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
                      if (confirm("Remove this program? This cannot be undone."))
                        remove.mutate(row.id);
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
      <TablePagination
        page={page}
        onPage={setPage}
        hasNext={list.data?.length === 20}
        pending={list.isFetching}
      />
    </PageShell>
  );
}
