import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { constants, existsSync } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { BACKUP_STATE_COLLECTION, SCHEMA_VERSION, type Database } from "@Alumni-Tracking-Ss/db";
import { keyFingerprint, parseSecretKey } from "@Alumni-Tracking-Ss/db/secret-box";
import { ApiError } from "../http-error";
import { BundleWriter, RECORD, readBundle, readBundleHeader, safeRelativePath } from "./bundle";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { googleAccessToken } from "../integrations/files";
import { readStoredCredentials } from "../integrations/credential-store";

export type BackupConfig = {
  encryptionKey?: string;
  dir?: string;
  toolsDir?: string;
  databaseUrl: string;
  uploadDir: string;
  appVersion: string;
  mfaEncryptionKey?: string;
  integrationEncryptionKey?: string;
};
export type BackupType = "manual" | "scheduled" | "pre-restore";
export type BackupManifest = {
  backupId: string;
  createdAt: string;
  type: BackupType;
  appVersion: string;
  schemaVersion: number;
  databaseName: string;
  collections: Record<string, number>;
  files: number;
  keyFingerprints: { mfa: string | null; integration: string | null };
};
export type CatalogEntry = {
  backupId: string;
  createdAt: string;
  type: BackupType;
  status: "running" | "succeeded" | "failed";
  sizeBytes: number;
  createdBy: string;
  verified: boolean;
  error?: string;
  offHost?: "copied" | "failed" | "skipped";
  manifest?: Omit<BackupManifest, "backupId" | "createdAt" | "type">;
};
type Digest = { archiveSha256: string; files: { path: string; sha256: string; size: number }[] };

const ID_PATTERN = /^[0-9]{14}-[a-f0-9]{8}$/;

export function backupReady(config: BackupConfig | undefined) {
  return {
    encryptionKey: Boolean(config?.encryptionKey && /^[a-f0-9]{64}$/i.test(config.encryptionKey)),
    dir: Boolean(config?.dir && path.isAbsolute(config.dir)),
    tools: Boolean(config?.toolsDir && existsSync(tool(config.toolsDir, "mongodump"))),
  };
}

function requireConfig(config: BackupConfig | undefined) {
  const ready = backupReady(config);
  if (!config || !ready.encryptionKey || !ready.dir || !ready.tools)
    throw new ApiError("SERVICE_UNAVAILABLE", {
      message:
        "Backups need BACKUP_ENCRYPTION_KEY, an absolute BACKUP_DIR and MONGODB_TOOLS_DIR on the server.",
    });
  return {
    key: parseSecretKey(config.encryptionKey, "BACKUP_ENCRYPTION_KEY"),
    dir: config.dir!,
    toolsDir: config.toolsDir!,
  };
}

const tool = (dir: string, name: string) =>
  path.join(dir, process.platform === "win32" ? `${name}.exe` : name);

export function fingerprintOf(hex: string | undefined) {
  try {
    return hex ? keyFingerprint(parseSecretKey(hex, "key")) : null;
  } catch {
    return null;
  }
}

/** Runs a database tool without a shell. Errors never include arguments (the URI holds credentials). */
async function runTool(
  binary: string,
  args: string[],
  io: { onStdout?: (chunk: Buffer) => Promise<void>; stdin?: AsyncIterable<Buffer> },
) {
  const child = spawn(binary, args, {
    stdio: [io.stdin ? "pipe" : "ignore", io.onStdout ? "pipe" : "ignore", "pipe"],
    windowsHide: true,
  });
  child.stderr?.resume();
  const exited = new Promise<number>((resolve, reject) => {
    child.once("error", () => reject(new Error(`${path.basename(binary)} could not start.`)));
    child.once("close", (code) => resolve(code ?? 1));
  });
  const work: Promise<void>[] = [];
  if (io.onStdout && child.stdout)
    work.push(
      (async () => {
        for await (const chunk of child.stdout!) await io.onStdout!(chunk as Buffer);
      })(),
    );
  if (io.stdin && child.stdin)
    work.push(
      (async () => {
        try {
          for await (const chunk of io.stdin!)
            if (!child.stdin!.write(chunk))
              await new Promise((resolve) => child.stdin!.once("drain", resolve));
        } finally {
          child.stdin!.end();
        }
      })(),
    );
  try {
    await Promise.all(work);
  } catch (error) {
    child.kill();
    throw error;
  }
  const code = await exited;
  if (code !== 0) throw new Error(`${path.basename(binary)} failed with exit code ${code}.`);
}

/** Never copied into a backup, even if UPLOAD_DIR is misconfigured to a wider folder. */
export function excludedFromBackup(name: string) {
  return (
    /^\.env(\..*)?$/i.test(name) ||
    [".tools", ".git", "node_modules"].includes(name) ||
    /\.(pem|key|p12|pfx)$/i.test(name)
  );
}

async function listUploadFiles(root: string) {
  const files: { rel: string; abs: string }[] = [];
  const walk = async (dir: string, prefix: string[]) => {
    if (!existsSync(dir)) return;
    for (const entry of await readdir(dir)) {
      if (excludedFromBackup(entry)) continue;
      const abs = path.join(dir, entry);
      const info = await lstat(abs);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) await walk(abs, [...prefix, entry]);
      else if (info.isFile()) files.push({ rel: [...prefix, entry].join("/"), abs });
    }
  };
  await walk(root, []);
  return files.sort((a, b) => a.rel.localeCompare(b.rel));
}

const catalogPath = (dir: string, id: string) => path.join(dir, `${id}.json`);
export const bundlePath = (dir: string, id: string) => path.join(dir, `${id}.atsbak`);

async function writeCatalog(dir: string, entry: CatalogEntry) {
  const target = catalogPath(dir, entry.backupId);
  const temp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temp, JSON.stringify(entry, null, 2), { mode: 0o600 });
  await rename(temp, target);
}

const safeError = (error: unknown) =>
  error instanceof ApiError
    ? error.message
    : error instanceof Error && /^(mongodump|mongorestore)|Backup/.test(error.message)
      ? error.message
      : "The backup step failed. Check the server log for details.";

export async function createBackup(input: {
  db: Database;
  config: BackupConfig | undefined;
  type: BackupType;
  createdBy?: string;
  failAfterDump?: boolean;
}): Promise<CatalogEntry> {
  const { key, dir, toolsDir } = requireConfig(input.config);
  const config = input.config!;
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const createdAt = new Date();
  const backupId = `${createdAt.toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(4).toString("hex")}`;
  const file = bundlePath(dir, backupId);
  const entry: CatalogEntry = {
    backupId,
    createdAt: createdAt.toISOString(),
    type: input.type,
    status: "running",
    sizeBytes: 0,
    createdBy: input.createdBy ?? "Scheduler",
    verified: false,
  };
  await writeCatalog(dir, entry);
  try {
    const native = input.db.connection.db;
    if (!native) throw new Error("Backup could not reach the database.");
    const names = (await native.listCollections({}, { nameOnly: true }).toArray())
      .map(({ name }) => name)
      .filter((name) => name !== BACKUP_STATE_COLLECTION)
      .sort();
    const collections: Record<string, number> = {};
    for (const name of names) collections[name] = await native.collection(name).countDocuments();
    const files = await listUploadFiles(config.uploadDir);
    const manifest: BackupManifest = {
      backupId,
      createdAt: entry.createdAt,
      type: input.type,
      appVersion: config.appVersion,
      schemaVersion: SCHEMA_VERSION,
      databaseName: native.databaseName,
      collections,
      files: files.length,
      keyFingerprints: {
        mfa: fingerprintOf(config.mfaEncryptionKey),
        integration: fingerprintOf(config.integrationEncryptionKey),
      },
    };
    const writer = await BundleWriter.create(file, key, backupId, createdAt);
    try {
      await writer.record(RECORD.manifest, "manifest.json", Buffer.from(JSON.stringify(manifest)));
      const archiveHash = createHash("sha256");
      await runTool(
        tool(toolsDir, "mongodump"),
        [
          `--uri=${config.databaseUrl}`,
          "--archive",
          "--gzip",
          `--excludeCollection=${BACKUP_STATE_COLLECTION}`,
        ],
        {
          onStdout: async (chunk) => {
            archiveHash.update(chunk);
            await writer.record(RECORD.archive, "", chunk);
          },
        },
      );
      if (input.failAfterDump) throw new Error("Backup was interrupted for a test.");
      const digest: Digest = { archiveSha256: archiveHash.digest("hex"), files: [] };
      for (const item of files) {
        const data = await readFile(item.abs);
        digest.files.push({
          path: item.rel,
          sha256: createHash("sha256").update(data).digest("hex"),
          size: data.length,
        });
        await writer.record(RECORD.file, item.rel, data);
      }
      await writer.record(RECORD.digest, "digest.json", Buffer.from(JSON.stringify(digest)));
      await writer.close();
    } catch (error) {
      await writer.abort();
      throw error;
    }
    const { backupId: _id, createdAt: _at, type: _type, ...summary } = manifest;
    entry.manifest = summary;
    entry.sizeBytes = (await stat(file)).size;
    try {
      await verifyBackup(config, backupId);
      entry.verified = true;
      entry.status = "succeeded";
      entry.offHost = await copyToDrive(input.db, config, file, backupId);
    } catch {
      entry.status = "failed";
      entry.error = "The backup was written but did not pass verification.";
    }
    await writeCatalog(dir, entry);
    if (entry.status === "failed")
      throw new ApiError("INTERNAL_SERVER_ERROR", { message: entry.error });
    return entry;
  } catch (error) {
    await rm(file, { force: true });
    entry.status = "failed";
    entry.error = safeError(error);
    await writeCatalog(dir, entry);
    throw error instanceof ApiError
      ? error
      : new ApiError("INTERNAL_SERVER_ERROR", { message: entry.error });
  }
}

/** Imports an encrypted bundle produced by this application and creates its local catalog entry. */
export async function importBackup(
  config: BackupConfig | undefined,
  temporaryPath: string,
  originalName: string,
  createdBy: string,
) {
  const { dir } = requireConfig(config);
  if (!originalName.toLowerCase().endsWith(".atsbak")) {
    await rm(temporaryPath, { force: true });
    throw new ApiError("BAD_REQUEST", { message: "Select an .atsbak backup file." });
  }
  let target: string | null = null;
  try {
    const header = await readBundleHeader(temporaryPath);
    if (!ID_PATTERN.test(header.backupId)) throw new Error("Backup ID is invalid.");
    const destination = bundlePath(dir, header.backupId);
    if (existsSync(destination) || existsSync(catalogPath(dir, header.backupId)))
      throw new ApiError("CONFLICT", { message: "This backup is already in the catalog." });
    await copyFile(temporaryPath, destination, constants.COPYFILE_EXCL);
    target = destination;
    await rm(temporaryPath, { force: true });
    const manifest = await verifyBackup(config, header.backupId);
    const { backupId: _id, createdAt: _at, type: _type, ...summary } = manifest;
    const entry: CatalogEntry = {
      backupId: manifest.backupId,
      createdAt: manifest.createdAt,
      type: manifest.type,
      status: "succeeded",
      sizeBytes: (await stat(target)).size,
      createdBy,
      verified: true,
      offHost: "skipped",
      manifest: summary,
    };
    await writeCatalog(dir, entry);
    return entry;
  } catch (error) {
    await rm(temporaryPath, { force: true });
    if (target) await rm(target, { force: true });
    if (error instanceof ApiError) throw error;
    throw new ApiError("BAD_REQUEST", {
      message: "The uploaded backup could not be verified with this server's backup key.",
    });
  }
}

/** Decrypts the whole bundle and checks every hash in its digest; returns the manifest. */
export async function verifyBackup(config: BackupConfig | undefined, backupId: string) {
  const { key, dir } = requireConfig(config);
  if (!ID_PATTERN.test(backupId)) throw new ApiError("NOT_FOUND", { message: "Backup not found." });
  let manifest: BackupManifest | null = null;
  let digest: Digest | null = null;
  const archiveHash = createHash("sha256");
  const fileHashes = new Map<string, { sha256: string; size: number }>();
  await readBundle(bundlePath(dir, backupId), key, backupId, ({ type, name, data }) => {
    if (type === RECORD.manifest) manifest = JSON.parse(data.toString("utf8")) as BackupManifest;
    else if (type === RECORD.archive) archiveHash.update(data);
    else if (type === RECORD.file) {
      safeRelativePath(name);
      fileHashes.set(name, {
        sha256: createHash("sha256").update(data).digest("hex"),
        size: data.length,
      });
    } else digest = JSON.parse(data.toString("utf8")) as Digest;
  });
  const found = digest as Digest | null;
  const head = manifest as BackupManifest | null;
  if (!head || !found || head.backupId !== backupId) throw new Error("Backup is incomplete.");
  if (found.archiveSha256 !== archiveHash.digest("hex"))
    throw new Error("Backup archive hash mismatch.");
  if (found.files.length !== fileHashes.size) throw new Error("Backup file list mismatch.");
  for (const item of found.files) {
    const seen = fileHashes.get(item.path);
    if (!seen || seen.sha256 !== item.sha256 || seen.size !== item.size)
      throw new Error("Backup file hash mismatch.");
  }
  return head;
}

export async function listBackups(config: BackupConfig | undefined): Promise<CatalogEntry[]> {
  if (!config?.dir || !existsSync(config.dir)) return [];
  const entries: CatalogEntry[] = [];
  for (const name of await readdir(config.dir))
    if (/^[0-9]{14}-[a-f0-9]{8}\.json$/.test(name))
      entries.push(JSON.parse(await readFile(path.join(config.dir, name), "utf8")) as CatalogEntry);
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getBackup(config: BackupConfig | undefined, backupId: string) {
  if (!ID_PATTERN.test(backupId) || !config?.dir)
    throw new ApiError("NOT_FOUND", { message: "Backup not found." });
  const file = catalogPath(config.dir, backupId);
  if (!existsSync(file)) throw new ApiError("NOT_FOUND", { message: "Backup not found." });
  return JSON.parse(await readFile(file, "utf8")) as CatalogEntry;
}

/** Keeps the newest `retention` successful scheduled backups; manual and pre-restore ones stay. */
export async function pruneScheduled(config: BackupConfig | undefined, retention: number) {
  if (!config?.dir) return [];
  const scheduled = (await listBackups(config)).filter(
    (entry) => entry.type === "scheduled" && entry.status === "succeeded",
  );
  const removed = scheduled.slice(Math.max(1, retention));
  for (const entry of removed) {
    await rm(bundlePath(config.dir, entry.backupId), { force: true });
    await rm(catalogPath(config.dir, entry.backupId), { force: true });
  }
  return removed.map((entry) => entry.backupId);
}

/**
 * Restores a verified bundle over the live database (mongorestore --drop --stopOnError) and swaps
 * the upload directory. Verifies the whole bundle first, then streams authenticated chunks.
 */
export async function applyBackup(
  db: Database,
  config: BackupConfig | undefined,
  backupId: string,
  step: (name: "database" | "files") => Promise<void>,
) {
  const { key, dir, toolsDir } = requireConfig(config);
  const manifest = await verifyBackup(config, backupId);
  const target = db.connection.db!.databaseName;
  const staging = `${config!.uploadDir}.restore-${randomBytes(4).toString("hex")}`;
  await mkdir(staging, { recursive: true, mode: 0o700 });
  try {
    await step("database");
    const queue: Buffer[] = [];
    let wake: (() => void) | null = null;
    let finished = false;
    let failure: unknown = null;
    async function* archive() {
      for (;;) {
        if (queue.length) yield queue.shift()!;
        else if (finished) return;
        else await new Promise<void>((resolve) => (wake = resolve));
      }
    }
    const restore = runTool(
      tool(toolsDir, "mongorestore"),
      [
        `--uri=${config!.databaseUrl}`,
        "--archive",
        "--gzip",
        "--drop",
        "--stopOnError",
        `--nsExclude=${manifest.databaseName}.${BACKUP_STATE_COLLECTION}`,
        `--nsFrom=${manifest.databaseName}.*`,
        `--nsTo=${target}.*`,
      ],
      { stdin: archive() },
    );
    const reading = readBundle(
      bundlePath(dir, backupId),
      key,
      backupId,
      async ({ type, name, data }) => {
        if (type === RECORD.archive) {
          queue.push(Buffer.from(data));
          wake?.();
          while (queue.length > 64) await new Promise((resolve) => setTimeout(resolve, 5));
        } else if (type === RECORD.file) {
          const parts = safeRelativePath(name);
          const destination = path.join(staging, ...parts);
          await mkdir(path.dirname(destination), { recursive: true });
          await writeFile(destination, data, { mode: 0o600 });
        }
      },
    )
      .catch((error: unknown) => {
        failure = error;
      })
      .finally(() => {
        finished = true;
        wake?.();
      });
    await Promise.all([restore, reading]);
    if (failure) throw failure;
    await step("files");
    const previous = `${config!.uploadDir}.old-${randomBytes(4).toString("hex")}`;
    if (existsSync(config!.uploadDir)) await rename(config!.uploadDir, previous);
    await rename(staging, config!.uploadDir);
    await rm(previous, { recursive: true, force: true });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return manifest;
}

/**
 * Optional off-host copy: when Google Drive is enabled with readable credentials, the encrypted
 * file (never plaintext) is uploaded to the Drive folder. A failed copy never fails the backup.
 */
export async function copyToDrive(
  db: Database,
  config: BackupConfig,
  file: string,
  backupId: string,
  fetcher: typeof fetch = fetch,
): Promise<"copied" | "failed" | "skipped"> {
  const row = await db.IntegrationSetting.findOne({ key: "google_drive" }).lean().exec();
  if (!row?.enabled) return "skipped";
  try {
    const key = config.integrationEncryptionKey
      ? parseSecretKey(config.integrationEncryptionKey, "INTEGRATION_ENCRYPTION_KEY")
      : null;
    const stored = await readStoredCredentials(row, key);
    const { serviceAccountJson, folderId } = stored.values;
    if (stored.status !== "ok" || !serviceAccountJson || !folderId) return "failed";
    const token = await googleAccessToken(
      serviceAccountJson,
      ["https://www.googleapis.com/auth/drive"],
      fetcher,
    );
    const size = (await stat(file)).size;
    const session = await fetcher(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
      {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": "application/octet-stream",
          "X-Upload-Content-Length": String(size),
        },
        body: JSON.stringify({ name: `${backupId}.atsbak`, parents: [folderId] }),
      },
    );
    const location = session.headers.get("location");
    if (!session.ok || !location) return "failed";
    const upload = await fetcher(location, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream", "Content-Length": String(size) },
      body: Readable.toWeb(createReadStream(file)) as unknown as RequestInit["body"],
      duplex: "half",
    } as RequestInit);
    return upload.ok ? "copied" : "failed";
  } catch {
    return "failed";
  }
}
