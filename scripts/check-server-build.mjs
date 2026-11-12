import path from "node:path";
import { projectRoot } from "./local-tools.mjs";
import { verifyServerArtifacts } from "./server-artifacts.mjs";
await verifyServerArtifacts(path.join(projectRoot, "apps/server/dist"));
console.log(
  "Server entry verified without obsolete Prisma clients or native engines; runtime dependencies still require deployment installation.",
);
