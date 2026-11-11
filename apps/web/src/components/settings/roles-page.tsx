import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { Textarea } from "@Alumni-Tracking-Ss/ui/components/textarea";
import type { PermissionItem } from "@Alumni-Tracking-Ss/contracts/permission-groups";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FormField, PrimaryButton } from "@/components/forms/form-layout";
import { PageHeader, PageShell } from "@/components/layout/page";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { can, useSession } from "@/lib/session";
import { client, api, queryClient } from "@/lib/api";
import { useConfirm } from "@/components/feedback/confirm-provider";
import { PermissionControls, AddRoleDialog, duplicateRoleName } from "./role-dialogs";

type Role = Awaited<ReturnType<typeof client.roles.list>>[number];
const version = (role: { updatedAt: Date }) => new Date(role.updatedAt).toISOString();

export function RolesPage() {
  const confirmAction = useConfirm();
  const session = useSession();
  const roles = useQuery(api.roles.list.queryOptions());
  const catalogAllowed = can(session.data?.permissions, "permissions.read");
  const permissions = useQuery({
    ...api.permissions.list.queryOptions(),
    enabled: catalogAllowed,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [creating, setCreating] = useState(false);
  const current = roles.data?.find((role) => role.id === selected);
  return (
    <PageShell>
      <PageHeader
        title="Roles and permissions"
        description="Select a role to review and manage its permissions."
        actions={
          can(session.data?.permissions, "roles.write") ? (
            <PrimaryButton
              disabled={!permissions.data}
              onClick={() => {
                setCreating(true);
              }}
            >
              Add Role
            </PrimaryButton>
          ) : null
        }
      />
      {creating && permissions.data ? (
        <AddRoleDialog
          permissions={permissions.data}
          roles={roles.data || []}
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            setSelected(created.id);
            setDirty(false);
            setCreating(false);
          }}
        />
      ) : null}
      {roles.isPending ? <p role="status">Loading roles...</p> : null}
      {roles.isError ? (
        <ErrorAlert onRetry={() => void roles.refetch()}>Unable to load roles.</ErrorAlert>
      ) : null}
      {roles.data?.length === 0 ? (
        <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          No roles found. Initialize the role catalog before assigning access.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Roles">
        {roles.data?.map((role) => (
          <button
            key={role.id}
            type="button"
            aria-pressed={selected === role.id}
            className={`min-w-0 rounded-xl border bg-card p-5 text-left shadow-card transition-[border-color,box-shadow,background-color] hover:border-primary/40 hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-accent/50 aria-pressed:ring-2 aria-pressed:ring-primary/15${
              role.description.trim() ? " group" : ""
            }`}
            onClick={async () => {
              if (
                !dirty ||
                (await confirmAction({
                  title: "Discard unsaved changes?",
                  confirmLabel: "Discard changes",
                  destructive: true,
                }))
              ) {
                setSelected(role.id);
                setDirty(false);
              }
            }}
          >
            <span className="block font-semibold">{role.name}</span>
            {role.description.trim() ? (
              <span
                className="mt-1 block text-sm text-muted-foreground line-clamp-2 group-hover:line-clamp-none group-focus-visible:line-clamp-none"
                title={role.description}
              >
                {role.description}
              </span>
            ) : null}
            <span className="mt-2 block text-sm tabular-nums text-muted-foreground">
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
        <ErrorAlert onRetry={() => void permissions.refetch()}>
          Unable to load the permission catalog.
        </ErrorAlert>
      ) : null}
      {current && permissions.data ? (
        <RoleEditor
          key={current.id}
          role={current}
          permissions={permissions.data}
          allRoles={roles.data || []}
          onDirty={setDirty}
          onClose={async () => {
            if (
              !dirty ||
              (await confirmAction({
                title: "Discard unsaved changes?",
                confirmLabel: "Discard changes",
                destructive: true,
              }))
            ) {
              setSelected(null);
              setDirty(false);
            }
          }}
        />
      ) : null}
    </PageShell>
  );
}

function RoleEditor({
  role,
  permissions,
  allRoles,
  onDirty,
  onClose,
}: {
  role: Role;
  permissions: PermissionItem[];
  allRoles: { id: string; name: string }[];
  onDirty: (dirty: boolean) => void;
  onClose: () => void;
}) {
  const session = useSession();
  const [baseline, setBaseline] = useState(() => ({
    version: version(role),
    ids: role.rolePermissions.map((item) => item.permissionId),
    name: role.name,
    description: role.description,
  }));
  const [ids, setIds] = useState(baseline.ids);
  const [name, setName] = useState(baseline.name);
  const [description, setDescription] = useState(baseline.description);
  const dirty =
    ids.length !== baseline.ids.length ||
    ids.some((id) => !baseline.ids.includes(id)) ||
    name !== baseline.name ||
    description !== baseline.description;
  const stale = version(role) > baseline.version;
  const editable =
    can(session.data?.permissions, "roles.write") &&
    role.key !== "super_admin" &&
    (!role.isSystem || session.data?.roles.includes("super_admin")) &&
    role.rolePermissions.every(({ permission }) => can(session.data?.permissions, permission.key));
  const duplicateName = name !== baseline.name ? duplicateRoleName(name, allRoles, role.id) : null;
  const save = useMutation({
    mutationFn: () =>
      client.roles.update({
        id: role.id,
        expectedUpdatedAt: baseline.version,
        name: name !== baseline.name ? name : undefined,
        description: description !== baseline.description ? description : undefined,
        permissionIds: ids,
      }),
    onSuccess: async (saved) => {
      const savedIds = saved.rolePermissions.map((item) => item.permissionId);
      setIds(savedIds);
      setName(saved.name);
      setDescription(saved.description);
      setBaseline({
        version: version(saved),
        ids: savedIds,
        name: saved.name,
        description: saved.description,
      });
      toast.success("Role saved");
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
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      pending={save.isPending}
      footer={
        <div className="flex flex-wrap gap-3">
          {editable ? (
            <PrimaryButton
              pending={save.isPending}
              disabled={!dirty || stale}
              onClick={() => save.mutate()}
            >
              Save changes
            </PrimaryButton>
          ) : null}
          <PrimaryButton
            variant="outline"
            disabled={save.isPending}
            onClick={() => {
              const currentIds = role.rolePermissions.map((item) => item.permissionId);
              setBaseline({
                version: version(role),
                ids: currentIds,
                name: role.name,
                description: role.description,
              });
              setIds(currentIds);
              setName(role.name);
              setDescription(role.description);
              save.reset();
            }}
          >
            {stale ? "Load latest permissions" : "Discard changes"}
          </PrimaryButton>
        </div>
      }
      title={role.name}
      description={
        editable
          ? "Edit the name, note, and permissions, then save."
          : "This role is read-only for your account."
      }
    >
      <div className="flex flex-col gap-5">
        <p role="status" aria-live="polite" className="rounded-lg bg-muted px-3 py-2 text-sm">
          {dirty ? "Unsaved changes" : "No unsaved changes"}
        </p>
        {stale ? (
          <p role="alert" className="text-sm text-destructive">
            This role changed on the server. Your draft is preserved. Reload the latest changes
            before saving.
          </p>
        ) : null}
        {save.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {save.error.message} Your draft has been preserved.
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id="role-edit-name" label="Name" required>
            {editable ? (
              <>
                <Input
                  id="role-edit-name"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={locked}
                />
                {duplicateName ? (
                  <p role="status" className="text-sm text-warning">
                    Another role is already named "{duplicateName}". Add a note that tells them
                    apart.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="py-2 text-sm">{role.name}</p>
            )}
          </FormField>
          <FormField id="role-edit-note" label="Note">
            {editable ? (
              <>
                <Textarea
                  id="role-edit-note"
                  rows={2}
                  maxLength={400}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={locked}
                  aria-describedby="role-edit-note-hint"
                />
                <p id="role-edit-note-hint" className="text-xs text-muted-foreground">
                  Shown on the role card. Use it to tell roles with similar names apart.
                </p>
              </>
            ) : (
              <p className="py-2 text-sm">{description || "-"}</p>
            )}
          </FormField>
        </div>
        <PermissionControls permissions={permissions} ids={ids} setIds={setIds} locked={locked} />
      </div>
    </FormDialog>
  );
}
