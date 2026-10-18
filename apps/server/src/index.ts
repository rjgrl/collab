import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { readIntegrationEnv } from "./context";
import { ENV } from "./env.server";
import { db } from "./services";
const integrationEnv = readIntegrationEnv();
if (
  ENV.NODE_ENV === "production" &&
  (!ENV.CORS_ORIGIN.startsWith("https://") || !integrationEnv.appUrl?.startsWith("https://"))
)
  throw new Error("Production application URLs must use HTTPS.");
const app = createApp({
  db,
  config: { nodeEnv: ENV.NODE_ENV, origin: ENV.CORS_ORIGIN },
  integrationEnv,
});
serve({ fetch: app.fetch, port: Number(process.env.PORT) || 3000 }, (info) => {
  console.log("Server listening on port " + info.port);
});
