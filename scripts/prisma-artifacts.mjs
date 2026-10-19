import { copyFile, readdir } from "node:fs/promises";
import path from "node:path";

export async function copyPrismaEngines(source, destination) {
  // Prisma may leave .node.tmp<PID> files when a running Windows process locks
  // the engine. These are generation debris, not deployable runtime engines.
  const engines = (await readdir(source)).filter((name) =>
    /^(libquery_engine-|query_engine-).+\.node$/.test(name),
  );
  if (!engines.length)
    throw new Error("Generate the Prisma client on the deployment platform before building.");
  await Promise.all(
    engines.map((name) => copyFile(path.join(source, name), path.join(destination, name))),
  );
  return engines;
}
