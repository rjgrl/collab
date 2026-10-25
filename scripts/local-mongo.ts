import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "../packages/db/src/index";

// Development only: a separate persistent, loopback-only single-node replica set.
const root = fileURLToPath(new URL("../.tools/mongodb-rs0/", import.meta.url));
const dataDir = path.join(root, "data");
const markerPath = path.join(root, "server.json");
const port = 27018;

async function listening() {
  return new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function findBinary() {
  if (existsSync(markerPath)) {
    const saved: { binary: string } = JSON.parse(await readFile(markerPath, "utf8"));
    if (!existsSync(saved.binary))
      throw new Error(
        "The MongoDB binary previously used for this local data is missing. Restore it before starting; do not upgrade the data directory automatically.",
      );
    return saved.binary;
  }
  if (process.platform === "win32") {
    const installRoot = path.join(
      process.env.ProgramFiles || "C:/Program Files",
      "MongoDB",
      "Server",
    );
    const versions = (await readdir(installRoot).catch(() => []))
      .filter((entry) => /^\d+(\.\d+)*$/.test(entry))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const version of versions) {
      const binary = path.join(installRoot, version, "bin", "mongod.exe");
      if (existsSync(binary)) return binary;
    }
  }
  const locator = spawnSync(process.platform === "win32" ? "where.exe" : "which", ["mongod"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const binary = locator.stdout?.trim().split(/\r?\n/)[0];
  if (!binary)
    throw new Error("Install MongoDB Server or add mongod to PATH, then run pnpm db:local again.");
  return binary;
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("db:local is for development only.");
  let owned = existsSync(markerPath);
  if (!(await listening())) {
    const binary = await findBinary();
    if (!owned && existsSync(dataDir) && (await readdir(dataDir)).length)
      throw new Error(
        "Unrecognized local MongoDB data directory. Refusing to open it without its server metadata.",
      );
    await mkdir(dataDir, { recursive: true });
    const child = spawn(
      binary,
      [
        "--dbpath",
        dataDir,
        "--replSet",
        "rs0",
        "--bind_ip",
        "127.0.0.1",
        "--port",
        String(port),
        "--logpath",
        path.join(root, "mongod.log"),
        "--logappend",
      ],
      { detached: true, stdio: "ignore", windowsHide: true },
    );
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    child.unref();
    await writeFile(markerPath, JSON.stringify({ binary, pid: child.pid }, null, 2));
    owned = true;
    console.log("Starting project-local MongoDB on 127.0.0.1:27018...");
  }
  for (let attempt = 0; attempt < 60 && !(await listening()); attempt++)
    await new Promise((resolve) => setTimeout(resolve, 500));
  const db = createDatabase({
    DATABASE_URL:
      "mongodb://127.0.0.1:27018/admin?directConnection=true&serverSelectionTimeoutMS=1000&connectTimeoutMS=1000",
  });
  try {
    await db.ready();
    for (let attempt = 0; attempt < 60; attempt++) {
      const hello = await db.connection.db!.command({ hello: 1 }).catch(() => null);
      if (hello) {
        if (hello.setName && hello.setName !== "rs0")
          throw new Error(
            "Port 27018 belongs to a different replica set. No configuration was changed.",
          );
        if (hello.isWritablePrimary === true && hello.setName === "rs0") {
          console.log("MongoDB rs0 is PRIMARY. Ready for local setup.");
          console.log(
            owned
              ? "Project data directory: " + dataDir
              : "Using an existing local rs0 instance; its data directory was not changed.",
          );
          return;
        }
        if (!hello.setName) {
          if (!owned)
            throw new Error(
              "An unmanaged MongoDB instance occupies port 27018. Refusing to initialize it.",
            );
          const options = await db.connection.db!.command({ getCmdLineOpts: 1 });
          const actualPath = (options.parsed as { storage?: { dbPath?: string } } | undefined)
            ?.storage?.dbPath;
          if (!actualPath || path.relative(dataDir, path.resolve(actualPath)) !== "")
            throw new Error(
              "The MongoDB process on port 27018 is using another data directory. Refusing to initialize it.",
            );
          await db.connection.db!.command({
            replSetInitiate: { _id: "rs0", members: [{ _id: 0, host: "localhost:27018" }] },
          });
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("Local MongoDB did not become PRIMARY. Inspect .tools/mongodb-rs0/mongod.log.");
  } finally {
    await db.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unable to start local MongoDB.");
  process.exitCode = 1;
});
