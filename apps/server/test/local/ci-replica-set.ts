// Test-only helper for the *-local.ts scripts. In CI (CI=true) there is no developer replica set,
// so start a throwaway single-node rs0 on 27018, as completion-local.ts does. Locally it does
// nothing and the scripts use the project replica set from `pnpm db:local`.
/** Same release as the project server; 9.0.0 and 9.0.1 were never published for download. */
export const CI_MONGODB_VERSION = "9.0.2";

export async function startCiReplicaSet(): Promise<() => Promise<void>> {
  if (process.env.CI !== "true") return async () => undefined;
  const { MongoMemoryReplSet } = await import("mongodb-memory-server-core");
  const replicaSet = await MongoMemoryReplSet.create({
    binary: { version: CI_MONGODB_VERSION },
    replSet: { count: 1, name: "rs0", storageEngine: "wiredTiger" },
    instanceOpts: [{ port: 27018 }],
  });
  return async () => {
    await replicaSet.stop();
  };
}
