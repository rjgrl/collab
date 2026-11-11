import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const VERSION = "100.20.1";
const artifacts = {
  win32: {
    name: `mongodb-database-tools-windows-x86_64-${VERSION}`,
    extension: "zip",
    sha256: "5a1a8aa2c87ca0685ffdcad403601b110d495d44afe579473b8f75ec46621c80",
  },
  linux: {
    name: `mongodb-database-tools-ubuntu2204-x86_64-${VERSION}`,
    extension: "tgz",
    sha256: "2d56bb351383f7a42ffb866666631da8b7bcd82503b273e0c16d3be201ad12c1",
  },
};

if (process.arch !== "x64" || !(process.platform in artifacts))
  throw new Error(`MongoDB tools installer does not support ${process.platform}/${process.arch}.`);
const artifact = artifacts[process.platform];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".tools");
const installDir = path.join(root, artifact.name);
const binDir = path.join(installDir, "bin");
const executable = path.join(binDir, process.platform === "win32" ? "mongodump.exe" : "mongodump");
const archive = path.join(root, `${artifact.name}.${artifact.extension}`);

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

if (!existsSync(executable)) {
  await mkdir(root, { recursive: true });
  const url = `https://fastdl.mongodb.org/tools/db/${artifact.name}.${artifact.extension}`;
  console.log(`Downloading official MongoDB Database Tools ${VERSION} from ${url}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(archive, { mode: 0o600 }));
  const actual = createHash("sha256")
    .update(await readFile(archive))
    .digest("hex");
  if (actual !== artifact.sha256) {
    await rm(archive, { force: true });
    throw new Error(`MongoDB tools checksum mismatch: expected ${artifact.sha256}, got ${actual}`);
  }
  await run("tar", ["-xf", archive, "-C", root]);
  await rm(archive, { force: true });
}

await run(executable, ["--version"]);
console.log(`MONGODB_TOOLS_DIR=${binDir}`);
if (process.env.GITHUB_ENV)
  await appendFile(process.env.GITHUB_ENV, `MONGODB_TOOLS_DIR=${binDir}\n`, "utf8");
