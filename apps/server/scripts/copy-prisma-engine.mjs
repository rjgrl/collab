import { copyFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const source = new URL("../../../packages/db/prisma/generated/", import.meta.url);
const destination = new URL("../dist/", import.meta.url);
const engines = (await readdir(source)).filter((name) =>
  /^(libquery_engine-|query_engine-)/.test(name),
);
if (!engines.length)
  throw new Error("Generate the Prisma client on the deployment platform before building.");
await Promise.all(
  engines.map((name) =>
    copyFile(fileURLToPath(new URL(name, source)), fileURLToPath(new URL(name, destination))),
  ),
);
