import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { CheckboxRow } from "@/components/checkbox-row";
import { DataTable, QuietButton, RowActions, TableCell, TableRow } from "@/components/data-table";
import {
  FieldsetLabel,
  FormField,
  PageHeader,
  PageShell,
  PrimaryButton,
} from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { TablePagination } from "@/components/table-pagination";
import { can, useSession } from "@/lib/session";
import { client, orpc, queryClient } from "@/utils/orpc";

export function UsersPage() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const users = useQuery(orpc.users.list.queryOptions({ input: { search, page, pageSize: 20 } }));
  const roles = useQuery(orpc.roles.list.queryOptions());
  const canWrite = can(session.data?.permissions, "users.write");
  const [draft, setDraft] = useState({
    name: "",
    email: "",
    password: "",
    roleIds: [] as string[],
  });

  const create = useMutation({
    mutationFn: () => client.users.create(draft),
    onSuccess: async () => {
      toast.success("User created");
      setOpen(false);
      setDraft({ name: "", email: "", password: "", roleIds: [] });
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  const toggleStatus = useMutation({
    mutationFn: (input: { id: string; status: "active" | "disabled" }) =>
      client.users.setStatus(input),
    onSuccess: async () => {
      toast.success("User updated");
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <PageShell>
      <PageHeader
        title="Members"
        description="Manage accounts and their roles."
        actions={
          canWrite ? (
            <PrimaryButton
              onClick={() => {
                create.reset();
                setDraft({ name: "", email: "", password: "", roleIds: [] });
                setOpen(true);
              }}
            >
              Add user
            </PrimaryButton>
          ) : null
        }
      />
      {canWrite && open ? (
        <FormDialog
          open
          onOpenChange={setOpen}
          pending={create.isPending}
          footer={
            <>
              <PrimaryButton
                type="submit"
                form="create-user"
                pending={create.isPending}
                disabled={!draft.roleIds.length || !roles.data}
                pendingLabel="Creating"
              >
                Create user
              </PrimaryButton>
            </>
          }
          title="Add user"
          description="Create an account and assign its roles."
        >
          <form
            id="create-user"
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <FormField id="name" label="Name" required>
              <Input
                id="name"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                required
              />
            </FormField>
            <FormField id="email" label="Email" required>
              <Input
                id="email"
                type="email"
                value={draft.email}
                onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                required
              />
            </FormField>
            <FormField id="password" label="Password" required>
              <Input
                id="password"
                type="password"
                value={draft.password}
                onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                required
                minLength={15}
                maxLength={256}
                autoComplete="new-password"
                aria-describedby="member-password-guidance"
              />
            </FormField>
            <p id="member-password-guidance" className="text-xs text-muted-foreground">
              Use 15–128 characters. Spaces and Unicode are welcome. Choose a unique passphrase.
            </p>
            <div className="flex flex-col gap-2">
              <FieldsetLabel>Roles</FieldsetLabel>
              {roles.data?.map((role) => (
                <CheckboxRow
                  key={role.id}
                  checked={draft.roleIds.includes(role.id)}
                  onCheckedChange={(checked) =>
                    setDraft({
                      ...draft,
                      roleIds: checked
                        ? [...draft.roleIds, role.id]
                        : draft.roleIds.filter((id) => id !== role.id),
                    })
                  }
                >
                  {role.name}
                </CheckboxRow>
              ))}
            </div>
          </form>
        </FormDialog>
      ) : null}
      <DataTable
        headers={["Name", "Email", "Roles", "Status", "Actions"]}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search users"
        loading={users.isPending}
        isEmpty={users.data?.length === 0}
        emptyTitle="No users found"
        emptyDescription="Create a user and assign at least one role."
      >
        {users.data?.map((user) => (
          <TableRow key={user.id}>
            <TableCell>{user.name}</TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell>
              {user.userRoles.map((item) => item.role.name).join(", ") || "None"}
            </TableCell>
            <TableCell>
              <StatusBadge tone={user.status === "active" ? "active" : "disabled"} />
            </TableCell>
            <TableCell>
              {can(session.data?.permissions, "users.delete") ? (
                <RowActions>
                  <QuietButton
                    onClick={() =>
                      toggleStatus.mutate({
                        id: user.id,
                        status: user.status === "active" ? "disabled" : "active",
                      })
                    }
                  >
                    {user.status === "active" ? "Disable" : "Enable"}
                  </QuietButton>
                </RowActions>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
      <TablePagination
        page={page}
        onPage={setPage}
        hasNext={users.data?.length === 20}
        pending={users.isFetching}
      />
    </PageShell>
  );
}
