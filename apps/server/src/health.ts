import type { Database } from "@Alumni-Tracking-Ss/db";

export async function healthDeadline(
  probe: () => Promise<boolean>,
  timeoutMs = 2000,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      probe().catch(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function databaseHealthy(db: Database, timeoutMs = 2000): Promise<boolean> {
  return healthDeadline(async () => {
    if (db.connection.readyState !== undefined && db.connection.readyState !== 1) return false;
    await db.ready();
    const hello = await db.connection.db?.command({ hello: 1 }, { timeoutMS: timeoutMs });
    return hello?.isWritablePrimary === true && typeof hello.setName === "string";
  }, timeoutMs);
}
