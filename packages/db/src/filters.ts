/** MongoDB omits optional null fields unless they are set explicitly. */
export function notDeletedFilter() {
  return {
    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
  };
}

export const notDeleted = notDeletedFilter();

export function withNotDeleted<T extends Record<string, unknown>>(where?: T) {
  const base = notDeletedFilter();
  if (!where || Object.keys(where).length === 0) {
    return base;
  }

  return {
    AND: [base, where],
  };
}
