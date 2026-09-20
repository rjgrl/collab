import { PrismaClient } from "../prisma/generated/client";
import type { DatabaseConfig } from "./config";

export function createPrismaClient(env: DatabaseConfig) {
  return new PrismaClient({ datasourceUrl: env.DATABASE_URL });
}

export type Database = ReturnType<typeof createPrismaClient>;

export { PERMISSIONS, PERMISSION_KEYS, ROLE_PRESETS } from "./permissions";
export type { PermissionKey } from "./permissions";
export { hashPassword, verifyPassword, createSessionToken } from "./password";
export { percentTracked } from "./dashboard";
export { notDeleted, notDeletedFilter, withNotDeleted } from "./filters";
