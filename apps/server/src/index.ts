import { serve } from "@hono/node-server";
import { Server as HttpServer } from "node:http";
import { createApp } from "./app";
import { readIntegrationEnv } from "./context";
import { ENV } from "./env.server";
import { db } from "./services";
import { drainAndDisconnect } from "./shutdown";
import { validateRuntimeConfig } from "./runtime-config";
const integrationEnv = readIntegrationEnv();
const runtime = validateRuntimeConfig({
  nodeEnv: ENV.NODE_ENV,
  origin: ENV.CORS_ORIGIN,
  appUrl: integrationEnv.appUrl,
  databaseUrl: ENV.DATABASE_URL,
  verificationSecret: integrationEnv.verificationSecret,
  mfaEncryptionKey: integrationEnv.mfaEncryptionKey,
  uploadDir: integrationEnv.uploadDir,
});
const app = createApp({
  db,
  config: {
    nodeEnv: ENV.NODE_ENV,
    origin: ENV.CORS_ORIGIN,
    trustedProxyIps: runtime.trustedProxyIps,
  },
  integrationEnv,
});
const server = serve(
  {
    fetch: app.fetch,
    hostname: process.env.HOST?.trim() || "127.0.0.1",
    port: Number(process.env.PORT) || 3000,
  },
  (info) => {
    console.log("Server listening on port " + info.port);
  },
);
let stopping = false;
if (server instanceof HttpServer) {
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void drainAndDisconnect(
      () =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
      () => db.$disconnect(),
      () => {
        if ("closeAllConnections" in server && typeof server.closeAllConnections === "function")
          server.closeAllConnections();
      },
    ).catch(() => {
      console.error(JSON.stringify({ event: "shutdown_failed" }));
      process.exitCode = 1;
    });
  });
