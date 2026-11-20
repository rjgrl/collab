export type DatabaseConfig = {
  MONGO_URI?: string;
  DATABASE_URL?: string;
};

export function resolveDatabaseUrl(config: DatabaseConfig): string {
  const mongoUri = config.MONGO_URI?.trim();
  const databaseUrl = config.DATABASE_URL?.trim();
  if (mongoUri && databaseUrl && mongoUri !== databaseUrl)
    throw new Error("MONGO_URI and DATABASE_URL must be identical when both are configured.");
  const resolved = mongoUri || databaseUrl;
  if (!resolved) throw new Error("Configure MONGO_URI or DATABASE_URL privately before starting.");
  if (!/^mongodb(?:\+srv)?:\/\//.test(resolved))
    throw new Error("MONGO_URI/DATABASE_URL must be a MongoDB connection string.");
  return resolved;
}
