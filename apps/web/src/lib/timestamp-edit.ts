import { useCallback, useState } from "react";
import type { TimestampEdit, TimestampPurpose } from "@Alumni-Tracking-Ss/contracts/timestamp";
import { client, RestError } from "@/lib/api";

/** A save rejected by timestamp ordering, an expired/used edit, or unavailable coordination. */
export function isTimestampConflict(error: unknown) {
  return (
    error instanceof RestError &&
    (error.code === "TIMESTAMP_CONFLICT" || error.code === "TIMESTAMP_UNAVAILABLE")
  );
}

/**
 * One open edit transaction (see docs/specs/timestamp-ordering.md). Begin when the editor opens;
 * the server issues the timestamp and an authorized snapshot. A conflict keeps the caller's
 * draft and blocks further saves until the user explicitly reloads.
 */
export function useTimestampEdit() {
  const [edit, setEdit] = useState<TimestampEdit | null>(null);
  const [conflict, setConflict] = useState(false);
  const begin = useCallback(async (purpose: TimestampPurpose, alumniIds: string[]) => {
    const started = await client.alumni.beginEdit({ purpose, alumniIds });
    setEdit(started);
    setConflict(false);
    return started;
  }, []);
  const reset = useCallback(() => {
    setEdit(null);
    setConflict(false);
  }, []);
  /** Returns true when the error was a timestamp conflict (now shown in the editor). */
  const handle = useCallback((error: unknown) => {
    if (!isTimestampConflict(error)) return false;
    setConflict(true);
    return true;
  }, []);
  return {
    edit,
    conflict,
    begin,
    reset,
    handle,
    options: { timestampEdit: edit?.token },
  };
}

/** Begin and immediately commit a single action (deletes, assignments) inside one edit context. */
export async function withTimestampEdit<T>(
  purpose: TimestampPurpose,
  alumniIds: string[],
  action: (options: { timestampEdit: string }) => Promise<T>,
) {
  const started = await client.alumni.beginEdit({ purpose, alumniIds });
  return action({ timestampEdit: started.token });
}
