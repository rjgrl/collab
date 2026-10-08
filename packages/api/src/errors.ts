export const DATABASE_UNAVAILABLE_MESSAGE =
  "Unable to reach the database. Check that MongoDB Atlas is running and this network is allowed.";

export function isDatabaseUnavailable(error: unknown) {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message, error.name);
  }
  if (typeof error === "object" && error && "code" in error) {
    parts.push(String((error as { code?: unknown }).code));
  }
  if (typeof error === "object" && error && "meta" in error) {
    parts.push(JSON.stringify((error as { meta?: unknown }).meta));
  }
  const text = parts.join(" ");
  return (
    text.includes("Server selection timeout") ||
    text.includes("ReplicaSetNoPrimary") ||
    text.includes("P2010") ||
    text.includes("Can't reach database server") ||
    text.includes("received fatal alert: InternalError") ||
    text.includes("database string is invalid")
  );
}

export function publicErrorMessage(error: unknown, fallback = "Request failed.") {
  if (isDatabaseUnavailable(error)) {
    return DATABASE_UNAVAILABLE_MESSAGE;
  }
  if (error instanceof Error && error.message) {
    const message = error.message.trim();
    if (message.startsWith("Invalid `") || message.includes("Prisma")) {
      return DATABASE_UNAVAILABLE_MESSAGE;
    }
    return message;
  }
  return fallback;
}
