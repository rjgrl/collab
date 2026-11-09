// Option lists must follow every page rather than silently hiding later records.
export async function collectOptionPages<T>(
  fetchPage: (page: number) => Promise<T[]>,
  pageSize = 100,
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= 1000; page += 1) {
    const batch = await fetchPage(page);
    items.push(...batch);
    if (batch.length < pageSize) return items;
  }
  throw new Error("This option list is too large to load. Contact an administrator.");
}
