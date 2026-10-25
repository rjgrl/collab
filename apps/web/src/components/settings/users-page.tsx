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
import { client, api, queryClient } from "@/utils/api";
import { NameFields, emptyName } from "@/components/name-fields";
import { isAdministrator } from "@Alumni-Tracking-Ss/contracts/names";
import { usersSchemas } from "@Alumni-Tracking-Ss/contracts/users";

export function UsersPage() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const users = useQuery(api.users.list.queryOptions({ input: { search, page, pageSize: 20 } }));
  const roles = useQuery(api.roles.list.queryOptions());
  const canWrite = Boolean(
    session.data && isAdministrator(session.data) && can(session.data.permissions, "users.write"),
  );
  const managedRoles = roles.data?.filter(
    (role) => role.key === "staff" || role.key === "super_admin",
  );
  const [draft, setDraft] = useState({
    ...emptyName,
    email: "",
    password: "",
    roleIds: [] as string[],
  });
  const create = useMutation({
    mutationFn: () => client.users.create(usersSchemas.create.input.parse(draft)),
    onSuccess: async () => {
      toast.success("User created");
      setOpen(false);
      setDraft({ ...emptyName, email: "", password: "", roleIds: [] });
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
              disabled={roles.isPending || roles.isError}
              onClick={() => {
                create.reset();
                setDraft({
                  ...emptyName,
                  email: "",
                  password: "",
                  roleIds:
                    roles.data?.filter((role) => role.key === "staff").map((role) => role.id) ?? [],
                });
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
          description="Create Staff or Super Admin accounts. Alumni create their own accounts through registration."
        >
          <form
            id="create-user"
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <NameFields
              value={draft}
              prefix="member"
              onChange={(names) => setDraft({ ...draft, ...names })}
            />
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
              {managedRoles?.map((role) => (
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
                  {role.key === "super_admin" ? "Super Admin" : "Staff"}
                </CheckboxRow>
              ))}
            </div>
          </form>
        </FormDialog>
      ) : null}
      {users.isError ? (
        <p role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
          {users.error.message}
          <QuietButton onClick={() => void users.refetch()}>Retry</QuietButton>
        </p>
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
            <TableCell>
              <span className="font-medium">{user.name}</span>
            </TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell>
              <span className="text-muted-foreground">
                {user.userRoles.map((item) => item.role.name).join(", ") || "None"}
              </span>
            </TableCell>
            <TableCell>
              <StatusBadge tone={user.status === "active" ? "active" : "disabled"} />
            </TableCell>
            <TableCell>
              {can(session.data?.permissions, "users.delete") ? (
                <RowActions>
                  {user.alumniId ? (
                    <span className="text-xs text-muted-foreground">Alumni linked</span>
                  ) : null}
                  {can(session.data?.permissions, "users.delete") ? (
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
                  ) : null}
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
