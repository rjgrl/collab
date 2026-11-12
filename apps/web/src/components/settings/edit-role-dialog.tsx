import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { Badge } from "@Alumni-Tracking-Ss/ui/components/badge";
import { useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import type { PermissionItem } from "@Alumni-Tracking-Ss/contracts/permission-groups";
import { matchingRoles } from "@Alumni-Tracking-Ss/contracts/role-match";

import { PermissionControls, AddRoleDialog } from "./role-dialogs";
import { PrimaryButton } from "@/components/forms/form-layout";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { useConfirm } from "@/components/feedback/confirm-provider";
import { client, queryClient } from "@/lib/api";

type Role = Awaited<ReturnType<typeof client.roles.list>>[number];
type User = {
  id: string;
  name: string;
  userRoles: Array<{ roleId: string; role: { id: string; name: string } }>;
};

export function EditRoleDialog({
  user,
  roles,
  permissions,
  onClose,
}: {
  user: User;
  roles: Role[];
  permissions: PermissionItem[] | null;
  onClose: () => void;
}) {
  const confirmAction = useConfirm();
  const [ids, setIds] = useState<string[]>(() => {
    // Initialize to the union of the member's current roles' permission ids
    const currentRoleIds = new Set(user.userRoles.map((ur) => ur.roleId));
    const permissionIds = new Set<string>();
    for (const role of roles) {
      if (currentRoleIds.has(role.id)) {
        for (const rp of role.rolePermissions) {
          permissionIds.add(rp.permissionId);
        }
      }
    }
    return Array.from(permissionIds);
  });

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [creatingRole, setCreatingRole] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get the catalog of known permissions
  const known = permissions ? permissions.map((p) => p.id) : [];

  // Find matching roles
  const rolesData = roles.map((r) => ({
    ...r,
    permissions: r.rolePermissions.map((p) => p.permissionId),
  }));
  const matches = matchingRoles(ids, rolesData, known);

  // Auto-select role when ids change
  useEffect(() => {
    if (selectedRoleId && matches.some((m) => m.id === selectedRoleId)) {
      // Current selection is still in matches, keep it
      return;
    }
    // Select the first matching role or null
    setSelectedRoleId(matches[0]?.id ?? null);
  }, [ids, matches, selectedRoleId]);

  // Get current role (user should only have one, but we'll get the first)
  const currentRoleId = user.userRoles[0]?.roleId;

  const updateUser = useMutation({
    mutationFn: (roleId: string) => client.users.update({ id: user.id, roleIds: [roleId] }),
    onSuccess: async () => {
      toast.success("Role updated");
      await queryClient.invalidateQueries();
      onClose();
    },
    onError: (error) => {
      setError(error.message);
    },
  });

  // Determine if save button should be disabled
  const saveDisabled = !selectedRoleId || selectedRoleId === currentRoleId || updateUser.isPending;

  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const catalogAvailable = permissions !== null;

  return (
    <>
      <FormDialog
        open
        onOpenChange={onClose}
        pending={updateUser.isPending}
        title={`Edit role for ${user.name}`}
        description="Pick a role, or adjust permissions to find the role that matches exactly."
        footer={
          <PrimaryButton
            disabled={saveDisabled}
            pending={updateUser.isPending}
            pendingLabel="Saving"
            onClick={async () => {
              const role = roles.find((r) => r.id === selectedRoleId);
              if (!role) return;
              const confirmed = await confirmAction({
                title: `Change ${user.name}'s role to ${role.name}?`,
                description: `${user.name} will be signed out of every session and must sign in again.`,
                confirmLabel: "Change role",
              });
              if (!confirmed) return;
              setError(null);
              updateUser.mutate(role.id);
            }}
          >
            Save role
          </PrimaryButton>
        }
      >
        <div className="flex flex-col gap-5">
          {error && <ErrorAlert>{error}</ErrorAlert>}

          {/* Role picker */}
          <div role="radiogroup" aria-label="Role">
            {roles.map((role) => {
              const isMatching = matches.some((m) => m.id === role.id);
              const isSelected = selectedRoleId === role.id;
              return (
                <label
                  key={role.id}
                  className="mb-3 flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-accent/50"
                >
                  <input
                    type="radio"
                    name="role"
                    value={role.id}
                    checked={isSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        // Picking a role loads its permissions; keep the explicit choice even
                        // when another role has the same permission set.
                        setIds(role.rolePermissions.map((p) => p.permissionId));
                        setSelectedRoleId(role.id);
                      }
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{role.name}</span>
                      {isMatching && (
                        <Badge variant="secondary" className="text-xs">
                          Matches
                        </Badge>
                      )}
                    </div>
                    {role.description.trim() && (
                      <p className="mt-1 text-xs text-muted-foreground">{role.description}</p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>

          {/* Permission catalog note */}
          {!catalogAvailable && (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              Permission catalog access is required to adjust permissions.
            </p>
          )}

          {/* Permission controls */}
          {catalogAvailable && permissions && (
            <PermissionControls
              permissions={permissions}
              ids={ids}
              setIds={setIds}
              locked={updateUser.isPending}
            />
          )}

          {/* Status line */}
          {catalogAvailable && (
            <div role="status" aria-live="polite" className="rounded-lg bg-muted px-3 py-2 text-sm">
              {selectedRoleId && matches.some((m) => m.id === selectedRoleId) ? (
                <span>Matches role: {selectedRole?.name}</span>
              ) : (
                <div className="flex items-center justify-between">
                  <span>No role has exactly these permissions.</span>
                  <PrimaryButton variant="outline" size="sm" onClick={() => setCreatingRole(true)}>
                    Create a new role with these permissions
                  </PrimaryButton>
                </div>
              )}
            </div>
          )}
        </div>
      </FormDialog>

      {creatingRole && (
        <AddRoleDialog
          permissions={permissions || []}
          roles={roles}
          initialPermissionIds={ids}
          onClose={() => setCreatingRole(false)}
          onCreated={(created) => {
            // After creation, set ids to the created role's permissions and select it
            setIds(created.rolePermissions.map((p) => p.permissionId));
            setSelectedRoleId(created.id);
            setCreatingRole(false);
          }}
        />
      )}
    </>
  );
}
