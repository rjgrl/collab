import { PrismaClient } from "../prisma/generated/client";
import type { DatabaseConfig } from "./config";

export function createPrismaClient(env: DatabaseConfig) {
  return new PrismaClient({ datasourceUrl: env.DATABASE_URL });
}

export type Database = ReturnType<typeof createPrismaClient>;
