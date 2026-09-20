import { Card, CardContent } from "@Alumni-Tracking-Ss/ui/components/card";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DataTable, QuietButton, TableCell, TableRow } from "@/components/data-table";
import { PageHeader, PrimaryButton } from "@/components/page-header";
import { can, useSession } from "@/lib/session";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_app/roles")({
  component: RolesPage,
});

function RolesPage() {
  const session = useSession();
  const roles = useQuery(orpc.roles.list.queryOptions());
  const permissions = useQuery(orpc.permissions.list.queryOptions());
  const canWrite = can(session.data?.permissions, "roles.write");
  const [selected, setSelected] = useState<string | null>(null);
  const [permissionIds, setPermissionIds] = useState<string[]>([]);
  const current = roles.data?.find((role) => role.id === selected);

  useEffect(() => {
    if (!current) {
      setPermissionIds([]);
      return;
    }
    setPermissionIds(current.rolePermissions.map((item) => item.permissionId));
  }, [current]);

  const save = useMutation({
    mutationFn: () => {
      if (!selected) {
        throw new Error("Select a role first.");
      }
      return client.roles.update({ id: selected, permissionIds });
    },
    onSuccess: async () => {
      toast.success("Role permissions saved");
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Roles and permissions"
        description="Roles, users, and permissions operate together as RBAC."
      />
      <DataTable headers={["Key", "Name", "Users", ""]}>
        {roles.data?.map((role) => (
          <TableRow key={role.id}>
            <TableCell>{role.key}</TableCell>
            <TableCell>{role.name}</TableCell>
            <TableCell>{role._count.userRoles}</TableCell>
            <TableCell>
              <QuietButton onClick={() => setSelected(role.id)}>Manage permissions</QuietButton>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
      {current && canWrite ? (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-4">
            <p className="text-sm font-medium">{current.name}</p>
            <div className="grid gap-2 md:grid-cols-2">
              {permissions.data?.map((permission) => {
                const checked = permissionIds.includes(permission.id);
                return (
                  <label key={permission.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        setPermissionIds((currentIds) =>
                          event.target.checked
                            ? [...currentIds, permission.id]
                            : currentIds.filter((id) => id !== permission.id),
                        );
                      }}
                    />
                    <span>
                      {permission.key}
                      <span className="block text-xs text-muted-foreground">{permission.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <PrimaryButton onClick={() => save.mutate()} pending={save.isPending}>
              Save permissions
            </PrimaryButton>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
