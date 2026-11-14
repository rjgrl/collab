import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { CheckboxRow } from "@/components/forms/checkbox-row";
import {
  DataTable,
  QuietButton,
  RowActions,
  TableCell,
  TableRow,
} from "@/components/data/data-table";
import { FieldsetLabel, FormField, PrimaryButton } from "@/components/forms/form-layout";
import { PageHeader, PageShell } from "@/components/layout/page";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { StatusBadge } from "@/components/data/status-badge";
import { TablePagination } from "@/components/data/table-pagination";
import { PasswordChecklist } from "@/components/forms/password-checklist";
import { can, useSession } from "@/lib/session";
import { client, api, queryClient } from "@/lib/api";
import { NameFields, emptyName } from "@/components/forms/name-fields";
import { isAdministrator, ROLE } from "@Alumni-Tracking-Ss/contracts/names";
import { usersSchemas } from "@Alumni-Tracking-Ss/contracts/users";
import { passwordMeetsPolicy } from "@Alumni-Tracking-Ss/contracts/password-policy";
import { EditRoleDialog } from "./edit-role-dialog";

export function UsersPage() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const users = useQuery(api.users.list.queryOptions({ input: { search, page, pageSize: 20 } }));
  const roles = useQuery(api.roles.list.queryOptions());
  const canWrite = Boolean(
    session.data && isAdministrator(session.data) && can(session.data.permissions, "users.write"),
  );
  const permissions = useQuery({
    ...api.permissions.list.queryOptions(),
    enabled: canWrite && can(session.data?.permissions, "permissions.read"),
  });
  const managedRoles = roles.data?.filter((role) => role.key === ROLE.superAdmin);
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
                  roleIds: managedRoles?.map((role) => role.id) ?? [],
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
                disabled={
                  !draft.roleIds.length || !roles.data || !passwordMeetsPolicy(draft.password)
                }
                pendingLabel="Creating"
              >
                Create user
              </PrimaryButton>
            </>
          }
          title="Add user"
          description="Create super admin accounts. Add faculty and heads from the faculty page; alumni register themselves."
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
            <PasswordChecklist id="member-password-guidance" value={draft.password} />
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
                  {role.key === ROLE.superAdmin ? "Super admin" : role.name}
                </CheckboxRow>
              ))}
            </div>
          </form>
        </FormDialog>
      ) : null}
      {users.isError ? (
        <ErrorAlert onRetry={() => void users.refetch()}>{users.error.message}</ErrorAlert>
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
              {canWrite || can(session.data?.permissions, "users.delete") ? (
                <RowActions>
                  {user.alumniId ? (
                    <span className="text-xs text-muted-foreground">Alumni linked</span>
                  ) : null}
                  {canWrite ? (
                    <QuietButton
                      aria-label={`Edit role for ${user.name}`}
                      onClick={() => setEditingUserId(user.id)}
                    >
                      Edit role
                    </QuietButton>
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
      {editingUserId && roles.data ? (
        <EditRoleDialog
          user={
            users.data?.find((u) => u.id === editingUserId) || {
              id: editingUserId,
              name: "",
              userRoles: [],
            }
          }
          roles={roles.data}
          permissions={permissions.data || null}
          onClose={() => setEditingUserId(null)}
        />
      ) : null}
    </PageShell>
  );
}
