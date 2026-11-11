import { Switch } from "@Alumni-Tracking-Ss/ui/components/switch";
import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { Textarea } from "@Alumni-Tracking-Ss/ui/components/textarea";
import {
  groupPermissions,
  groupState,
  togglePermissions,
} from "@Alumni-Tracking-Ss/contracts/permission-groups";
import type { PermissionItem } from "@Alumni-Tracking-Ss/contracts/permission-groups";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FormField, PrimaryButton } from "@/components/forms/form-layout";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { can, useSession } from "@/lib/session";
import { client, queryClient } from "@/lib/api";

type Role = Awaited<ReturnType<typeof client.roles.list>>[number];

export function PermissionControls({
  permissions,
  ids,
  setIds,
  locked,
}: {
  permissions: PermissionItem[];
  ids: string[];
  setIds: React.Dispatch<React.SetStateAction<string[]>>;
  locked: boolean;
}) {
  const session = useSession();
  const [search, setSearch] = useState("");
  const matches = (permission: PermissionItem) =>
    `${permission.name} ${permission.description} ${permission.key}`
      .toLowerCase()
      .includes(search.trim().toLowerCase());
  return (
    <div className="flex flex-col gap-3">
      <Input
        aria-label="Search permissions"
        placeholder="Find a permission..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        {ids.length} permissions enabled. Group switches apply to all permissions in their group.
      </p>
      {groupPermissions(permissions)
        .filter((group) => group.items.some(matches))
        .map((group) => {
          const applicable = group.items
            .filter((permission) => can(session.data?.permissions, permission.key))
            .map((permission) => permission.id);
          const state = groupState(applicable, ids);
          return (
            <fieldset key={group.key} className="rounded-xl border p-4">
              <legend className="px-1 text-sm font-medium">{group.label}</legend>
              <label className="mb-3 flex min-h-10 items-center gap-3 border-b pb-3 text-sm">
                <Switch
                  checked={state.checked}
                  disabled={locked || !applicable.length}
                  aria-label={`Enable all ${group.label.toLowerCase()} permissions`}
                  aria-describedby={`permission-group-${group.key}`}
                  onCheckedChange={(checked) =>
                    setIds((current) => togglePermissions(current, applicable, checked))
                  }
                />
                <span>
                  All applicable permissions{" "}
                  <span id={`permission-group-${group.key}`} className="text-muted-foreground">
                    ({state.count}/{applicable.length})
                    {state.indeterminate ? " | Partially enabled" : ""}
                  </span>
                </span>
              </label>
              <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                {group.items.filter(matches).map((permission) => (
                  <label key={permission.id} className="flex min-h-10 items-start gap-3 text-sm">
                    <Switch
                      className="mt-1"
                      checked={ids.includes(permission.id)}
                      disabled={locked || !can(session.data?.permissions, permission.key)}
                      onCheckedChange={(checked) =>
                        setIds((current) => togglePermissions(current, [permission.id], checked))
                      }
                    />
                    <span>
                      <span className="font-medium">{permission.name}</span>
                      <span className="block text-muted-foreground">{permission.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}

      {!permissions.some(matches) ? <p role="status">No matching permissions.</p> : null}
    </div>
  );
}

export function duplicateRoleName(
  name: string,
  roles: { id: string; name: string }[],
  exceptId?: string,
): string | null {
  const trimmedName = name.trim().toLowerCase();
  if (!trimmedName) return null;
  const other = roles.find(
    (role) => role.name.trim().toLowerCase() === trimmedName && role.id !== exceptId,
  );
  return other ? other.name : null;
}

export function AddRoleDialog({
  permissions,
  roles,
  initialPermissionIds = [],
  onClose,
  onCreated,
}: {
  permissions: PermissionItem[];
  roles: { id: string; name: string }[];
  initialPermissionIds?: string[];
  onClose: () => void;
  onCreated: (role: Role) => void;
}) {
  const [newRole, setNewRole] = useState({ key: "", name: "", description: "" });
  const [newIds, setNewIds] = useState<string[]>(initialPermissionIds);

  const create = useMutation({
    mutationFn: () => client.roles.create({ ...newRole, permissionIds: newIds }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries();
      setNewIds([]);
      setNewRole({ key: "", name: "", description: "" });
      toast.success("Role created");
      onCreated(created);
    },
    onError: (error) => toast.error(error.message),
  });

  const duplicateName = duplicateRoleName(newRole.name, roles);

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      pending={create.isPending}
      title="Add Role"
      description="All permissions start off. Enable only the access this role needs."
      footer={
        <PrimaryButton form="create-role" type="submit" pending={create.isPending}>
          Create role
        </PrimaryButton>
      }
    >
      <form
        id="create-role"
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <FormField id="role-key" label="Key" required>
          <Input
            id="role-key"
            required
            pattern="[a-z][a-z0-9_]{0,63}"
            maxLength={64}
            value={newRole.key}
            onChange={(event) => setNewRole({ ...newRole, key: event.target.value })}
          />
        </FormField>
        <FormField id="role-name" label="Name" required>
          <Input
            id="role-name"
            required
            maxLength={80}
            value={newRole.name}
            onChange={(event) => {
              setNewRole({ ...newRole, name: event.target.value });
            }}
          />
          {duplicateName ? (
            <p role="status" className="text-sm text-warning">
              Another role is already named "{duplicateName}". Add a note that tells them apart.
            </p>
          ) : null}
        </FormField>
        <FormField id="role-description" label="Note">
          <Textarea
            id="role-description"
            rows={2}
            maxLength={400}
            value={newRole.description}
            onChange={(event) => setNewRole({ ...newRole, description: event.target.value })}
            aria-describedby="role-description-hint"
          />
          <p id="role-description-hint" className="text-xs text-muted-foreground">
            Shown on the role card. Use it to tell roles with similar names apart.
          </p>
        </FormField>
        {create.isError ? (
          <ErrorAlert className="sm:col-span-2">{create.error.message}</ErrorAlert>
        ) : null}
        <div className="sm:col-span-2">
          <PermissionControls
            permissions={permissions}
            ids={newIds}
            setIds={setNewIds}
            locked={create.isPending}
          />
        </div>
      </form>
    </FormDialog>
  );
}
