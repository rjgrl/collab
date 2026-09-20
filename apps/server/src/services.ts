import { createPrismaClient } from "@Alumni-Tracking-Ss/db";

import { ENV } from "./env.server";

export const db = createPrismaClient(ENV);
