// Shared target check for explicit server-side local testing exemptions.
export function isManagedLocalDatabaseUrl(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    return (
      url.protocol === "mongodb:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      url.port === "27018" &&
      !url.username &&
      !url.password &&
      /^\/[A-Za-z0-9_-]+$/.test(url.pathname) &&
      url.searchParams.getAll("replicaSet").length === 1 &&
      url.searchParams.get("replicaSet") === "rs0" &&
      [...url.searchParams.keys()].every((key) =>
        ["replicaSet", "serverSelectionTimeoutMS", "connectTimeoutMS"].includes(key),
      )
    );
  } catch {
    return false;
  }
}
