import { Card, CardContent } from "@Alumni-Tracking-Ss/ui/components/card";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, QuietButton, TableCell, TableRow } from "@/components/data-table";
import { FormField, PageHeader, PrimaryButton } from "@/components/page-header";
import { can, useSession } from "@/lib/session";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_app/users")({
  component: UsersPage,
});

function UsersPage() {
  const session = useSession();
  const [search, setSearch] = useState("");
  const users = useQuery(orpc.users.list.queryOptions({ input: { search } }));
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
      setDraft({ name: "", email: "", password: "", roleIds: [] });
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  const toggleStatus = useMutation({
    mutationFn: (input: { id: string; status: "active" | "disabled" }) => client.users.update(input),
    onSuccess: async () => {
      toast.success("User updated");
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Users" description="Assign roles to control access through RBAC." />
      {canWrite ? (
        <Card>
          <CardContent className="pt-4">
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                create.mutate();
              }}
            >
              <FormField id="name" label="Name">
                <Input
                  id="name"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  required
                />
              </FormField>
              <FormField id="email" label="Email">
                <Input
                  id="email"
                  type="email"
                  value={draft.email}
                  onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                  required
                />
              </FormField>
              <FormField id="password" label="Password">
                <Input
                  id="password"
                  type="password"
                  value={draft.password}
                  onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                  required
                  minLength={8}
                />
              </FormField>
              <div>
                <p className="mb-2 text-xs">Roles</p>
                <div className="flex flex-col gap-2">
                  {roles.data?.map((role) => (
                    <label key={role.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.roleIds.includes(role.id)}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            roleIds: event.target.checked
                              ? [...draft.roleIds, role.id]
                              : draft.roleIds.filter((id) => id !== role.id),
                          })
                        }
                      />
                      {role.name}
                    </label>
                  ))}
                </div>
              </div>
              <PrimaryButton type="submit" pending={create.isPending}>
                Create user
              </PrimaryButton>
            </form>
          </CardContent>
        </Card>
      ) : null}
      <DataTable headers={["Name", "Email", "Roles", "Status", ""]} search={search} onSearch={setSearch}>
        {users.data?.map((user) => (
          <TableRow key={user.id}>
            <TableCell>{user.name}</TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell>{user.userRoles.map((item) => item.role.name).join(", ") || "None"}</TableCell>
            <TableCell>{user.status}</TableCell>
            <TableCell>
              {canWrite ? (
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
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </div>
  );
}
