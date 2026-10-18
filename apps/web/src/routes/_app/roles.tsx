import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CheckboxRow } from "@/components/checkbox-row";
import { DataTable, QuietButton, RowActions, TableCell, TableRow } from "@/components/data-table";
import { FormCard, PageHeader, PageShell, PrimaryButton } from "@/components/page-header";
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
    <PageShell>
      <PageHeader
        title="Roles"
        description="Roles, users, and permissions operate together as RBAC."
      />
      <DataTable
        headers={["Key", "Name", "Users", "Actions"]}
        loading={roles.isPending}
        isEmpty={roles.data?.length === 0}
        emptyTitle="No roles found"
        emptyDescription="System roles are created when the database is seeded."
      >
        {roles.data?.map((role) => (
          <TableRow key={role.id}>
            <TableCell>{role.key}</TableCell>
            <TableCell>{role.name}</TableCell>
            <TableCell>{role._count.userRoles}</TableCell>
            <TableCell>
              <RowActions>
                <QuietButton onClick={() => setSelected(role.id)}>Manage permissions</QuietButton>
              </RowActions>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
      {current && canWrite ? (
        <FormCard title={current.name} description="Select the permissions this role can use.">
          <div className="flex flex-col gap-4">
            <div className="grid gap-2 md:grid-cols-2">
              {permissions.data?.map((permission) => (
                <CheckboxRow
                  key={permission.id}
                  checked={permissionIds.includes(permission.id)}
                  onCheckedChange={(checked) => {
                    setPermissionIds((currentIds) =>
                      checked
                        ? [...currentIds, permission.id]
                        : currentIds.filter((id) => id !== permission.id),
                    );
                  }}
                >
                  <span>
                    {permission.key}
                    <span className="mt-0.5 block text-xs text-muted-foreground">{permission.description}</span>
                  </span>
                </CheckboxRow>
              ))}
            </div>
            <PrimaryButton onClick={() => save.mutate()} pending={save.isPending}>
              Save permissions
            </PrimaryButton>
          </div>
        </FormCard>
      ) : null}
    </PageShell>
  );
}
