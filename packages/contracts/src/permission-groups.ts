export type PermissionItem = {
  id: string;
  key: string;
  name: string;
  description: string;
  module: string;
};

export const GROUP_LABELS: Record<string, string> = {
  rbac: "Users, roles and access",
  academic: "Academic structure",
  alumni: "Alumni and tracking",
  files: "Evidence and files",
  dashboard: "Dashboard",
  reports: "Reports and exports",
  integrations: "Integrations",
  audit: "Audit history",
};

export function groupPermissions<T extends PermissionItem>(permissions: T[]) {
  const groups = new Map<string, T[]>();
  for (const permission of permissions)
    groups.set(permission.module, [...(groups.get(permission.module) ?? []), permission]);
  return [...groups].map(([key, items]) => ({ key, label: GROUP_LABELS[key] ?? key, items }));
}

export function groupState(ids: string[], selected: string[]) {
  const count = ids.filter((id) => selected.includes(id)).length;
  return {
    checked: ids.length > 0 && count === ids.length,
    indeterminate: count > 0 && count < ids.length,
    count,
  };
}

export function togglePermissions(selected: string[], ids: string[], enabled: boolean) {
  const next = new Set(selected);
  for (const id of ids) {
    if (enabled) next.add(id);
    else next.delete(id);
  }
  return [...next];
}
