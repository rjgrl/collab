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
  const [draft, setDraft] = useState<Draft | null>(null);
  const departments = useQuery(orpc.departments.list.queryOptions({ input: {} }));
  const list = useQuery(orpc.programs.list.queryOptions({ input: { search } }));
  const canWrite = can(session.data?.permissions, "programs.write");
  const canDelete = can(session.data?.permissions, "programs.delete");

  const save = useMutation({
    mutationFn: (value: Draft) =>
      value.id
        ? client.programs.update(value)
        : client.programs.create(value),
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
    <div className="flex flex-col gap-6">
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
        <Card>
          <CardContent className="pt-4">
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate(draft);
              }}
            >
              <FormField id="department" label="Department">
                <select
                  id="department"
                  className="h-8 border border-input bg-transparent px-2 text-xs"
                  value={draft.departmentId}
                  onChange={(event) => setDraft({ ...draft, departmentId: event.target.value })}
                  required
                >
                  <option value="">Select department</option>
                  {departments.data?.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.code} — {department.name}
                    </option>
                  ))}
                </select>
              </FormField>
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
        headers={["Code", "Name", "Department", "Alumni", ""]}
        search={search}
        onSearch={setSearch}
      >
        {list.data?.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.code}</TableCell>
            <TableCell>{row.name}</TableCell>
            <TableCell>
              {row.department.code} — {row.department.name}
            </TableCell>
            <TableCell>{row._count.alumni}</TableCell>
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
                      if (confirm("Remove this program?")) remove.mutate(row.id);
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
