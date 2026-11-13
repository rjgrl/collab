import { useSyncExternalStore } from "react";

/**
 * Whether the signed-in user's session has ended (idle limit, signed out elsewhere, password
 * changed, revoked by an administrator, or the absolute limit). Set once per signed-in period.
 */
let ended = false;
const listeners = new Set<() => void>();

export function markSessionEnded() {
  if (ended) return;
  ended = true;
  for (const listener of listeners) listener();
}

export function clearSessionEnded() {
  ended = false;
  for (const listener of listeners) listener();
}

export function useSessionEnded() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => ended,
    () => false,
  );
}

/** Same-site path to return to after signing in again; anything else is dropped. */
export function safeReturnPath(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return;
  if (value.includes("\\") || /^\/(login|reset-password)(?:[/?#]|$)/.test(value)) return;
  return value;
}
