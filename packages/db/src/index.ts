import { AsyncLocalStorage } from "node:async_hooks";
import mongoose, { type Connection } from "mongoose";
import type { DatabaseConfig } from "./config";
import { createModels, type DatabaseModels } from "./models";

function withMongoDriverOptions(url: string) {
  const queryIndex = url.indexOf("?");
  const base = queryIndex === -1 ? url : url.slice(0, queryIndex);
  const search = new URLSearchParams(queryIndex === -1 ? "" : url.slice(queryIndex + 1));
  if (!search.has("serverSelectionTimeoutMS")) {
    search.set("serverSelectionTimeoutMS", "8000");
  }
  return `${base}?${search.toString()}`;
}

mongoose.set("transactionAsyncLocalStorage", true);
const transactionScope = new AsyncLocalStorage<ReadonlySet<Connection>>();

export interface Database extends DatabaseModels {
  connection: Connection;
  transaction<T>(work: (tx: Database) => Promise<T>): Promise<T>;
  disconnect(): Promise<void>;
  ready(): Promise<void>;
}

export function createDatabase(env: DatabaseConfig): Database {
  const connection = mongoose.createConnection(withMongoDriverOptions(env.DATABASE_URL), {
    autoIndex: false,
    autoCreate: false,
    maxPoolSize: 10,
  });
  const db: Database = {
    ...createModels(connection),
    connection,
    ready: async () => {
      await connection.asPromise();
    },
    disconnect: async () => {
      await connection.close();
    },
    transaction: async <T>(work: (tx: Database) => Promise<T>) => {
      const active = transactionScope.getStore();
      if (active?.has(connection)) return work(db);
      await db.ready();
      return connection.transaction(() =>
        transactionScope.run(new Set([...(active ?? []), connection]), () => work(db)),
      );
    },
  };
  return db;
}

export { toEntity } from "./serialization";
export type { Entity } from "./serialization";
export type * from "./models";

export { PERMISSIONS, PERMISSION_KEYS, ROLE_PRESETS, isPermissionKey } from "./permissions";
export type { PermissionKey } from "./permissions";
export { hashPassword, verifyPassword, createSessionToken } from "./password";
export { percentTracked } from "./dashboard";
export { notDeleted, notDeletedFilter, withNotDeleted } from "./filters";
