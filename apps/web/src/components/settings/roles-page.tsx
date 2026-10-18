import { Checkbox } from "@Alumni-Tracking-Ss/ui/components/checkbox";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import {
  groupPermissions,
  groupState,
  togglePermissions,
} from "@Alumni-Tracking-Ss/api/permission-groups";
import type { PermissionItem } from "@Alumni-Tracking-Ss/api/permission-groups";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  FormCard,
  FormField,
  PageHeader,
  PageShell,
  PrimaryButton,
} from "@/components/page-header";
import { can, useSession } from "@/lib/session";
import { client, orpc, queryClient } from "@/utils/orpc";

type Role = Awaited<ReturnType<typeof client.roles.list>>[number];
const version = (role: { updatedAt: Date }) => new Date(role.updatedAt).toISOString();

export function RolesPage() {
  const session = useSession();
  const roles = useQuery(orpc.roles.list.queryOptions());
  const catalogAllowed = can(session.data?.permissions, "permissions.read");
  const permissions = useQuery({
    ...orpc.permissions.list.queryOptions(),
    enabled: catalogAllowed,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [newRole, setNewRole] = useState({ key: "", name: "", description: "" });
  const create = useMutation({
    mutationFn: () => client.roles.create({ ...newRole, permissionIds: [] }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries();
      setDirty(false);
      setSelected(created.id);
      setNewRole({ key: "", name: "", description: "" });
      toast.success("Role created. Select its permissions below.");
    },
    onError: (error) => toast.error(error.message),
  });
  const current = roles.data?.find((role) => role.id === selected);
  return (
    <PageShell>
      <PageHeader
        title="Roles and permissions"
        description="Choose a role, adjust access by group or permission, then save your changes."
      />
      {can(session.data?.permissions, "roles.write") ? (
        <FormCard title="Create role" description="New roles start with no permissions.">
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!dirty || window.confirm("Discard unsaved permission changes?")) {
                create.mutate();
              }
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
                onChange={(event) => setNewRole({ ...newRole, name: event.target.value })}
              />
            </FormField>
            <FormField id="role-description" label="Description">
              <Input
                id="role-description"
                maxLength={400}
                value={newRole.description}
                onChange={(event) => setNewRole({ ...newRole, description: event.target.value })}
              />
            </FormField>
            {create.isError ? <p role="alert">{create.error.message}</p> : null}
            <PrimaryButton type="submit" pending={create.isPending}>
              Create role
            </PrimaryButton>
          </form>
        </FormCard>
      ) : null}
      {roles.isPending ? <p role="status">Loading roles...</p> : null}
      {roles.isError ? (
        <div role="alert">
          Unable to load roles. <button onClick={() => void roles.refetch()}>Retry</button>
        </div>
      ) : null}
      {roles.data?.length === 0 ? (
        <p>No roles found. Initialize the role catalog before assigning access.</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Roles">
        {roles.data?.map((role) => (
          <button
            key={role.id}
            type="button"
            aria-pressed={selected === role.id}
            className="rounded-lg border p-4 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-primary"
            onClick={() => {
              if (!dirty || window.confirm("Discard unsaved permission changes?")) {
                setSelected(role.id);
                setDirty(false);
              }
            }}
          >
            <span className="block font-medium">{role.name}</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {role._count.userRoles} members | {role.rolePermissions.length} permissions
              {role.key === "super_admin" ? " | Protected" : ""}
            </span>
          </button>
        ))}
      </div>
      {!catalogAllowed ? (
        <p role="status">
          Permission catalog access is required to inspect individual permissions.
        </p>
      ) : null}
      {permissions.isError ? (
        <div role="alert">
          Unable to load the permission catalog.{" "}
          <button onClick={() => void permissions.refetch()}>Retry</button>
        </div>
      ) : null}
      {current && permissions.data ? (
        <RoleEditor
          key={current.id}
          role={current}
          permissions={permissions.data}
          onDirty={setDirty}
        />
      ) : null}
    </PageShell>
  );
}

function RoleEditor({
  role,
  permissions,
  onDirty,
}: {
  role: Role;
  permissions: PermissionItem[];
  onDirty: (dirty: boolean) => void;
}) {
  const session = useSession();
  const [baseline, setBaseline] = useState(() => ({
    version: version(role),
    ids: role.rolePermissions.map((item) => item.permissionId),
  }));
  const [ids, setIds] = useState(baseline.ids);
  const dirty = ids.length !== baseline.ids.length || ids.some((id) => !baseline.ids.includes(id));
  const stale = version(role) > baseline.version;
  const editable =
    can(session.data?.permissions, "roles.write") &&
    role.key !== "super_admin" &&
    (!role.isSystem || session.data?.roles.includes("super_admin")) &&
    role.rolePermissions.every(({ permission }) => can(session.data?.permissions, permission.key));
  const save = useMutation({
    mutationFn: () =>
      client.roles.update({ id: role.id, expectedUpdatedAt: baseline.version, permissionIds: ids }),
    onSuccess: async (saved) => {
      const savedIds = saved.rolePermissions.map((item) => item.permissionId);
      setIds(savedIds);
      setBaseline({ version: version(saved), ids: savedIds });
      toast.success("Role permissions saved");
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const locked = !editable || save.isPending;
  return (
    <FormCard
      title={role.name}
      description={
        editable
          ? "Group controls affect every permission you are allowed to grant. Changes apply after saving."
          : "This role is read-only for your account."
      }
    >
      <div className="flex flex-col gap-5">
        <p role="status" aria-live="polite" className="text-sm">
          {dirty ? "Unsaved changes" : "No unsaved changes"}
        </p>
        {stale ? (
          <p role="alert" className="text-sm text-destructive">
            This role changed on the server. Your draft is preserved. Reload the latest permissions
            before saving.
          </p>
        ) : null}
        {save.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {save.error.message} Your draft has been preserved.
          </p>
        ) : null}
        {groupPermissions(permissions).map((group) => {
          const applicable = group.items
            .filter((permission) => can(session.data?.permissions, permission.key))
            .map((permission) => permission.id);
          const state = groupState(applicable, ids);
          return (
            <fieldset key={group.key} className="rounded-lg border p-4">
              <legend className="px-1 text-sm font-medium">{group.label}</legend>
              <label className="mb-4 flex min-h-10 items-center gap-3 text-sm">
                <Checkbox
                  checked={state.checked}
                  indeterminate={state.indeterminate}
                  disabled={locked || !applicable.length}
                  aria-label={`Enable all ${group.label.toLowerCase()} permissions`}
                  onCheckedChange={(checked) =>
                    setIds((current) => togglePermissions(current, applicable, checked))
                  }
                />
                <span>
                  All applicable permissions{" "}
                  <span className="text-muted-foreground">
                    ({state.count}/{applicable.length})
                    {state.indeterminate ? " | Partially enabled" : ""}
                  </span>
                </span>
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                {group.items.map((permission) => (
                  <label key={permission.id} className="flex min-h-10 items-start gap-3 text-sm">
                    <Checkbox
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
        <div className="flex flex-wrap gap-3">
          {editable ? (
            <PrimaryButton
              pending={save.isPending}
              disabled={!dirty || stale}
              onClick={() => save.mutate()}
            >
              Save permissions
            </PrimaryButton>
          ) : null}
          <PrimaryButton
            variant="outline"
            disabled={save.isPending}
            onClick={() => {
              const currentIds = role.rolePermissions.map((item) => item.permissionId);
              setBaseline({ version: version(role), ids: currentIds });
              setIds(currentIds);
              save.reset();
            }}
          >
            {stale ? "Load latest permissions" : "Discard changes"}
          </PrimaryButton>
        </div>
      </div>
    </FormCard>
  );
}
