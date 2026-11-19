import { createDatabase, resolveDatabaseUrl } from "@Alumni-Tracking-Ss/db";

import { ENV } from "./env.server";

export const databaseUrl = resolveDatabaseUrl(ENV);
export const db = createDatabase({ DATABASE_URL: databaseUrl });
