/**
 * Roles whose permission set equals `selected` exactly. Order and duplicates do not matter.
 * Identifiers outside `known` (retired or unknown permissions) are ignored on both sides, so a
 * role that still carries a retired grant matches the same visible checklist.
 */
export function matchingRoles<R extends { permissions: readonly string[] }>(
  selected: readonly string[],
  roles: readonly R[],
  known: Iterable<string>,
): R[] {
  const catalog = new Set(known);
  const normalize = (ids: readonly string[]) => new Set(ids.filter((id) => catalog.has(id)));
  const wanted = normalize(selected);
  return roles.filter((role) => {
    const granted = normalize(role.permissions);
    return granted.size === wanted.size && [...wanted].every((id) => granted.has(id));
  });
}
