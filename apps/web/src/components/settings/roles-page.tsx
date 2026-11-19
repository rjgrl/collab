import { ROLE, isAdministrator } from "@Alumni-Tracking-Ss/contracts/names";
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
import {
  PermissionControls,
  AddRoleDialog,
  duplicateRoleName,
  grantablePermissionIds,
} from "./role-dialogs";

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
        title="Roles and Permissions"
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
                  title: "Discard Unsaved Changes?",
                  confirmLabel: "Discard Changes",
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
              {role.key === ROLE.superAdmin ? " | Protected" : ""}
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
          onDone={() => {
            setSelected(null);
            setDirty(false);
          }}
          onClose={async () => {
            if (
              !dirty ||
              (await confirmAction({
                title: "Discard Unsaved Changes?",
                confirmLabel: "Discard Changes",
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
  onDone,
  onClose,
}: {
  role: Role;
  permissions: PermissionItem[];
  allRoles: { id: string; name: string }[];
  onDirty: (dirty: boolean) => void;
  onClose: () => void;
  /** Closes without asking: the draft was saved elsewhere (split into a new role). */
  onDone: () => void;
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
  const superAdminRole = role.key === ROLE.superAdmin || role.baseRole === ROLE.superAdmin;
  // "selected": the edited permissions go to a new role holding only the picked members.
  const [applyTo, setApplyTo] = useState<"all" | "selected">("all");
  const [picked, setPicked] = useState<string[]>([]);
  const myId = session.data?.id;
  const pickedNames = role.members
    .filter((member) => picked.includes(member.id))
    .map((member) => member.name);
  const splitName = `${role.name} – ${pickedNames.join(", ")}`.slice(0, 80);
  const dirty =
    ids.length !== baseline.ids.length ||
    ids.some((id) => !baseline.ids.includes(id)) ||
    name !== baseline.name ||
    description !== baseline.description;
  const stale = version(role) > baseline.version;
  const editable =
    can(session.data?.permissions, "roles.write") &&
    role.key !== ROLE.superAdmin &&
    (!superAdminRole || (session.data ? isAdministrator(session.data) : false)) &&
    (!role.isSystem || (session.data ? isAdministrator(session.data) : false)) &&
    role.rolePermissions.every(({ permission }) => can(session.data?.permissions, permission.key));
  // Splitting is offered for Faculty, custom and Super Admin roles (not Alumni), even when the
  // role itself is protected: only the moved members get the new permissions.
  const canSplit =
    can(session.data?.permissions, "roles.write") &&
    role.key !== ROLE.alumni &&
    role.members.length > 1 &&
    role.members.some((member) => member.id !== myId);
  const splitting = canSplit && applyTo === "selected";
  const duplicateName = name !== baseline.name ? duplicateRoleName(name, allRoles, role.id) : null;
  const split = useMutation({
    mutationFn: () =>
      client.roles.split({
        id: role.id,
        expectedUpdatedAt: baseline.version,
        userIds: picked,
        name: splitName,
        description,
        permissionIds: grantablePermissionIds(ids, permissions, superAdminRole),
      }),
    onSuccess: async (created) => {
      toast.success(`Moved ${pickedNames.join(", ")} to "${created.name}"`);
      onDone();
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });
  const save = useMutation({
    mutationFn: () =>
      client.roles.update({
        id: role.id,
        expectedUpdatedAt: baseline.version,
        name: name !== baseline.name ? name : undefined,
        description: description !== baseline.description ? description : undefined,
        permissionIds: grantablePermissionIds(ids, permissions, superAdminRole),
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
  const locked = (!editable && !splitting) || save.isPending || split.isPending;
  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      pending={save.isPending}
      footer={
        <div className="flex flex-wrap gap-3">
          {splitting ? (
            <PrimaryButton
              pending={split.isPending}
              disabled={!picked.length || stale}
              onClick={() => split.mutate()}
            >
              Save for Selected Members
            </PrimaryButton>
          ) : editable ? (
            <PrimaryButton
              pending={save.isPending}
              disabled={!dirty || stale}
              onClick={() => save.mutate()}
            >
              Save Changes
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
            {stale ? "Load Latest Permissions" : "Discard Changes"}
          </PrimaryButton>
        </div>
      }
      title={role.name}
      description={
        role.key === ROLE.superAdmin
          ? "Super Admin always has full access. To give someone limited access, choose Only Selected Members."
          : editable
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
            {role.key !== ROLE.alumni ? (
              <RoleMembers
                members={role.members}
                myId={myId}
                selectable={splitting}
                picked={picked}
                onPick={setPicked}
              />
            ) : null}
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
        {canSplit ? (
          <fieldset className="flex flex-col gap-1 rounded-xl border p-4">
            <legend className="px-1 text-sm font-medium">Apply Changes To</legend>
            <label className="flex min-h-10 items-center gap-3 text-sm">
              <input
                type="radio"
                name="role-apply-to"
                className="size-4 accent-primary"
                checked={applyTo === "all"}
                disabled={!editable}
                onChange={() => setApplyTo("all")}
              />
              <span>
                All Members{" "}
                <span className="text-muted-foreground">
                  {editable ? "(changes this role)" : "(this role is protected)"}
                </span>
              </span>
            </label>
            <label className="flex min-h-10 items-center gap-3 text-sm">
              <input
                type="radio"
                name="role-apply-to"
                className="size-4 accent-primary"
                checked={applyTo === "selected"}
                onChange={() => setApplyTo("selected")}
              />
              <span>
                Only Selected Members{" "}
                <span className="text-muted-foreground">(moves them to a new role)</span>
              </span>
            </label>
            {splitting ? (
              <p role="status" className="text-sm text-muted-foreground">
                {picked.length
                  ? `New role: "${splitName}". The selected members are signed out so their new access applies.`
                  : "Tick the members who should get these permissions."}
              </p>
            ) : null}
          </fieldset>
        ) : null}
        <PermissionControls
          permissions={permissions}
          ids={ids}
          setIds={setIds}
          locked={locked}
          superAdminRole={superAdminRole}
        />
      </div>
    </FormDialog>
  );
}

function RoleMembers({
  members,
  myId,
  selectable,
  picked,
  onPick,
}: {
  members: Role["members"];
  myId?: string;
  selectable: boolean;
  picked: string[];
  onPick: (ids: string[]) => void;
}) {
  if (!members.length) return <p className="mt-2 text-sm text-muted-foreground">No members yet.</p>;
  return (
    <div className="mt-3">
      <p id="role-members-label" className="text-sm font-medium">
        Members ({members.length})
      </p>
      <ul aria-labelledby="role-members-label" className="mt-1 max-h-40 overflow-y-auto text-sm">
        {members.map((member) => {
          const self = member.id === myId;
          return (
            <li key={member.id} className="flex min-h-9 items-center gap-2">
              {selectable ? (
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  aria-label={`Select ${member.name}`}
                  disabled={self}
                  checked={picked.includes(member.id)}
                  onChange={(event) =>
                    onPick(
                      event.target.checked
                        ? [...picked, member.id]
                        : picked.filter((id) => id !== member.id),
                    )
                  }
                />
              ) : null}
              <span className="min-w-0 truncate" title={member.email}>
                {member.name}
                {self ? <span className="text-muted-foreground"> (you)</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
