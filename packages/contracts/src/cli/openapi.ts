// Writes docs/api/openapi.json from the shared route table. Run `pnpm openapi` after changing
// packages/contracts/src/api-routes.ts or any contract; `pnpm test` fails while the file is stale.
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildOpenApiDocument } from "../openapi";

const target = fileURLToPath(new URL("../../../../docs/api/openapi.json", import.meta.url));
await mkdir(fileURLToPath(new URL("../../../../docs/api/", import.meta.url)), { recursive: true });
await writeFile(target, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`);
console.log(`Wrote ${target}`);
