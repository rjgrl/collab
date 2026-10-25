import type { AuthUser } from "../context";
import { isAdministrator } from "@Alumni-Tracking-Ss/contracts/names";

import { isManagedLocalDatabaseUrl } from "./local-testing";

export function localMfaDisabled(settings: NodeJS.ProcessEnv = process.env) {
  return (
    settings.NODE_ENV === "development" &&
    settings.LOCAL_DISABLE_MFA === "true" &&
    isManagedLocalDatabaseUrl(settings.DATABASE_URL)
  );
}

export function privilegedAccount(user: Pick<AuthUser, "roles" | "permissions">) {
  return isAdministrator(user);
}

export function requiresMfa(
  user: Pick<AuthUser, "roles" | "permissions" | "mfaRequired" | "mfaEnrolled">,
  settings: NodeJS.ProcessEnv = process.env,
) {
  return privilegedAccount(user) && !localMfaDisabled(settings);
}
