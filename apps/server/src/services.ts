import { createDatabase } from "@Alumni-Tracking-Ss/db";

import { ENV } from "./env.server";

export const db = createDatabase(ENV);
