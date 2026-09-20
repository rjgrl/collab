import { Card, CardContent } from "@Alumni-Tracking-Ss/ui/components/card";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { Textarea } from "@Alumni-Tracking-Ss/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, QuietButton, TableCell, TableRow } from "@/components/data-table";
import { FormField, PageHeader, PrimaryButton } from "@/components/page-header";
import { can, useSession } from "@/lib/session";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_app/departments")({
  component: DepartmentsPage,
});

type Draft = { id?: string; code: string; name: string; description: string };

const emptyDraft: Draft = { code: "", name: "", description: "" };

function DepartmentsPage() {
  const session = useSession();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const list = useQuery(orpc.departments.list.queryOptions({ input: { search } }));
  const canWrite = can(session.data?.permissions, "departments.write");
  const canDelete = can(session.data?.permissions, "departments.delete");

  const save = useMutation({
    mutationFn: async (value: Draft) => {
      if (value.id) {
        return client.departments.update({
          id: value.id,
          code: value.code,
          name: value.name,
          description: value.description,
        });
      }
      return client.departments.create({
        code: value.code,
        name: value.name,
        description: value.description,
      });
    },
    onSuccess: async () => {
      toast.success("Department saved");
      setDraft(null);
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => client.departments.delete({ id }),
    onSuccess: async () => {
      toast.success("Department removed");
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Departments"
        description="Programs attach to a department. Faculties can also be added to a department."
        actions={
          canWrite ? (
            <PrimaryButton onClick={() => setDraft(emptyDraft)}>Add department</PrimaryButton>
          ) : null
        }
      />
      {draft ? (
        <Card>
          <CardContent className="pt-4">
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate(draft);
              }}
            >
              <FormField id="code" label="Code">
                <Input
                  id="code"
                  value={draft.code}
                  onChange={(event) => setDraft({ ...draft, code: event.target.value })}
                  required
                />
              </FormField>
              <FormField id="name" label="Name">
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
              <div className="flex gap-2 md:col-span-2">
                <PrimaryButton type="submit" pending={save.isPending}>
                  Save
                </PrimaryButton>
                <QuietButton type="button" onClick={() => setDraft(null)}>
                  Cancel
                </QuietButton>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
      <DataTable
        headers={["Code", "Name", "Programs", "Faculties", ""]}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search departments"
      >
        {list.data?.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.code}</TableCell>
            <TableCell>{row.name}</TableCell>
            <TableCell>{row._count.programs}</TableCell>
            <TableCell>{row._count.facultyDepartments}</TableCell>
            <TableCell>
              <div className="flex gap-2">
                {canWrite ? (
                  <QuietButton
                    onClick={() =>
                      setDraft({
                        id: row.id,
                        code: row.code,
                        name: row.name,
                        description: row.description,
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
                      if (confirm("Remove this department?")) {
                        remove.mutate(row.id);
                      }
                    }}
                  >
                    Remove
                  </QuietButton>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </div>
  );
}
