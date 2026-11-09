import { TablePagination } from "@/components/data/table-pagination";
import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { Textarea } from "@Alumni-Tracking-Ss/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
  DataTable,
  QuietButton,
  RowActions,
  TableCell,
  TableRow,
} from "@/components/data/data-table";
import { FormField, PrimaryButton } from "@/components/forms/form-layout";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { PageHeader, PageShell } from "@/components/layout/page";
import { can, useSession } from "@/lib/session";
import { client, api, queryClient } from "@/lib/api";
import { useConfirm } from "@/components/feedback/confirm-provider";

export const Route = createFileRoute("/_app/colleges")({
  component: CollegesPage,
});

type Draft = { id?: string; name: string; description: string };

function CollegesPage() {
  const confirmAction = useConfirm();
  const session = useSession();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const list = useQuery(api.colleges.list.queryOptions({ input: { search, page, pageSize: 20 } }));
  const canWrite = can(session.data?.permissions, "departments.write");
  const canDelete = can(session.data?.permissions, "departments.delete");

  const save = useMutation({
    mutationFn: (value: Draft) =>
      value.id
        ? client.colleges.update({ id: value.id, name: value.name, description: value.description })
        : client.colleges.create({ name: value.name, description: value.description }),
    onSuccess: async () => {
      toast.success("College saved");
      setDraft(null);
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => client.colleges.delete({ id }),
    onSuccess: async () => {
      toast.success("College archived");
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <PageShell>
      <PageHeader
        title="Colleges"
        description="Top level of the academic structure. Each college holds departments, and departments hold programs."
        actions={
          canWrite ? (
            <PrimaryButton onClick={() => setDraft({ name: "", description: "" })}>
              Add college
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
              <PrimaryButton type="submit" form="college-form" pending={save.isPending}>
                Save
              </PrimaryButton>
              <QuietButton type="button" disabled={save.isPending} onClick={() => setDraft(null)}>
                Cancel
              </QuietButton>
            </div>
          }
          title={draft.id ? "Edit college" : "Add college"}
        >
          <form
            id="college-form"
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate(draft);
            }}
          >
            <FormField id="college-name" label="Name" required>
              <Input
                id="college-name"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                required
              />
            </FormField>
            <FormField id="college-description" label="Description">
              <Textarea
                id="college-description"
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </FormField>
          </form>
        </FormDialog>
      ) : null}
      {list.isError ? (
        <ErrorAlert onRetry={() => void list.refetch()}>{list.error.message}</ErrorAlert>
      ) : null}
      <DataTable
        headers={["Name", "Departments", "Actions"]}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search colleges"
        loading={list.isPending}
        isEmpty={list.data?.length === 0}
        emptyTitle="No colleges found"
        emptyDescription="Add a college to start adding departments."
      >
        {list.data?.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <span className="font-medium">{row.name}</span>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row._count.departments.toLocaleString()}
            </TableCell>
            <TableCell>
              <RowActions>
                {canWrite ? (
                  <QuietButton
                    onClick={() =>
                      setDraft({ id: row.id, name: row.name, description: row.description })
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
                          title: `Archive ${row.name}?`,
                          description: "Colleges with departments cannot be archived.",
                          confirmLabel: "Archive",
                          destructive: true,
                        })
                      )
                        remove.mutate(row.id);
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
        page={page}
        onPage={setPage}
        hasNext={list.data?.length === 20}
        pending={list.isFetching}
      />
    </PageShell>
  );
}
