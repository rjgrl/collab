import { fileURLToPath } from "node:url";
import { copyPrismaEngines } from "../../../scripts/prisma-artifacts.mjs";
const source = new URL("../../../packages/db/prisma/generated/", import.meta.url);
const destination = new URL("../dist/", import.meta.url);
await copyPrismaEngines(fileURLToPath(source), fileURLToPath(destination));
