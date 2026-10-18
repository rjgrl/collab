import { PrismaClient } from "../prisma/generated/client";
import type { DatabaseConfig } from "./config";

function withMongoDriverOptions(url: string) {
  const queryIndex = url.indexOf("?");
  const base = queryIndex === -1 ? url : url.slice(0, queryIndex);
  const search = new URLSearchParams(queryIndex === -1 ? "" : url.slice(queryIndex + 1));
  if (!search.has("serverSelectionTimeoutMS")) {
    search.set("serverSelectionTimeoutMS", "8000");
  }
  return `${base}?${search.toString()}`;
}

export function createPrismaClient(env: DatabaseConfig) {
  return new PrismaClient({ datasourceUrl: withMongoDriverOptions(env.DATABASE_URL) });
}

export type Database = ReturnType<typeof createPrismaClient>;
export type { Prisma } from "../prisma/generated/client";

export { PERMISSIONS, PERMISSION_KEYS, ROLE_PRESETS } from "./permissions";
export type { PermissionKey } from "./permissions";
export { hashPassword, verifyPassword, createSessionToken } from "./password";
export { percentTracked } from "./dashboard";
export { notDeleted, notDeletedFilter, withNotDeleted } from "./filters";
