import { TablePagination } from "@/components/data/table-pagination";
import { FormSelect } from "@/components/forms/form-select";
import { useCollegeOptions } from "@/lib/academic-options";
import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { Textarea } from "@Alumni-Tracking-Ss/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  DataTable,
  QuietButton,
  RowActions,
  TableCell,
  TableRow,
} from "@/components/data/data-table";
import { FormField, PrimaryButton } from "@/components/forms/form-layout";
import { PageHeader, PageShell } from "@/components/layout/page";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { can, useSession } from "@/lib/session";
import { client, api, queryClient } from "@/lib/api";
import { useConfirm } from "@/components/feedback/confirm-provider";

export const Route = createFileRoute("/_app/departments")({
  component: DepartmentsPage,
});

type Draft = { id?: string; collegeId: string; name: string; description: string };

function DepartmentsPage() {
  const confirmAction = useConfirm();
  const session = useSession();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const colleges = useCollegeOptions();
  // A new department defaults to the first college, even if the list arrives after the dialog opens.
  const firstCollegeId = colleges.data?.[0]?.id;
  useEffect(() => {
    if (firstCollegeId && draft && !draft.id && !draft.collegeId)
      setDraft({ ...draft, collegeId: firstCollegeId });
  }, [firstCollegeId, draft]);
  const list = useQuery(
    api.departments.list.queryOptions({ input: { search, page, pageSize: 20 } }),
  );
  const canWrite = can(session.data?.permissions, "departments.write");
  const canDelete = can(session.data?.permissions, "departments.delete");

  const save = useMutation({
    mutationFn: async (value: Draft) => {
      if (value.id) {
        return client.departments.update({
          id: value.id,
          collegeId: value.collegeId,
          name: value.name,
          description: value.description,
        });
      }
      return client.departments.create({
        collegeId: value.collegeId,
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
    <PageShell>
      <PageHeader
        title="Departments"
        description="Organize alumni programs by department."
        actions={
          canWrite ? (
            <PrimaryButton
              onClick={() =>
                setDraft({ collegeId: colleges.data?.[0]?.id ?? "", name: "", description: "" })
              }
            >
              Add department
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
          title={draft.id ? "Edit department" : "Add department"}
        >
          <form
            id="academic-form"
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate(draft);
            }}
          >
            <FormField id="college" label="College" required>
              <FormSelect
                id="college"
                value={draft.collegeId}
                onValueChange={(selected) => setDraft({ ...draft, collegeId: selected })}
                required
                items={[
                  { value: "", label: "Select college" },
                  ...(colleges.data?.map((college) => ({
                    value: college.id,
                    label: college.name,
                  })) ?? []),
                ]}
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
      {list.isError ? (
        <ErrorAlert onRetry={() => void list.refetch()}>{list.error.message}</ErrorAlert>
      ) : null}
      <DataTable
        headers={["Name", "College", "Programs", "Actions"]}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search departments"
        loading={list.isPending}
        isEmpty={list.data?.length === 0}
        emptyTitle="No departments found"
        emptyDescription="Add a department to start attaching programs."
      >
        {list.data?.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <span className="font-medium">{row.name}</span>
            </TableCell>
            <TableCell>{row.college?.name ?? ""}</TableCell>
            <TableCell className="text-right tabular-nums">
              {row._count.programs.toLocaleString()}
            </TableCell>
            <TableCell>
              <RowActions>
                {canWrite ? (
                  <QuietButton
                    onClick={() =>
                      setDraft({
                        id: row.id,
                        collegeId: row.collegeId,
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
                    onClick={async () => {
                      if (
                        await confirmAction({
                          title: "Remove this department?",
                          description: "This cannot be undone.",
                          confirmLabel: "Remove",
                          destructive: true,
                        })
                      ) {
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
      <TablePagination
        page={page}
        onPage={setPage}
        hasNext={list.data?.length === 20}
        pending={list.isFetching}
      />
    </PageShell>
  );
}
