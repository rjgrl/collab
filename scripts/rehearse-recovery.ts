import assert from "node:assert/strict";
import { randomBytes, createHash, createCipheriv, createDecipheriv } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, chmod, stat, readdir } from "node:fs/promises";
import path from "node:path";
import { createDatabase, toEntity } from "../packages/db/src/index";
import { migrateDatabase } from "../packages/db/src/migration";
import { readPrivateFile } from "../packages/api/src/integrations/files";
import { acceptFormsSubmission } from "../packages/api/src/services/forms";
import { projectRoot } from "./local-tools.mjs";
import { isManagedLocalDatabase } from "./local-env.mjs";

if (process.env.NODE_ENV === "production") throw Error("Local rehearsal only");
const execute = promisify(execFile);
const id = randomBytes(6).toString("hex");
const sourceName = `collab_recovery_source_${id}`;
const targetName = `collab_recovery_target_${id}`;
const localUrl = (name: string) => `mongodb://127.0.0.1:27018/${name}?replicaSet=rs0`;
assert.ok(
  isManagedLocalDatabase(localUrl(sourceName)) && isManagedLocalDatabase(localUrl(targetName)),
);
const root = path.join(projectRoot, ".tools", `recovery-${id}`);
await mkdir(root, { mode: 0o700 });
let accessEvidence: string;
if (process.platform === "win32") {
  const identity = (await execute("whoami", ["/user", "/fo", "csv", "/nh"])).stdout.match(
    /S-1-5-[\d-]+/,
  )?.[0];
  assert.ok(identity);
  await execute("icacls", [
    root,
    "/inheritance:r",
    "/grant:r",
    `*${identity}:(OI)(CI)F`,
    "*S-1-5-18:(OI)(CI)F",
  ]);
  accessEvidence = (await execute("icacls", [root])).stdout;
  assert.ok(!/S-1-1-0|Everyone|BUILTIN\\Users|Authenticated Users/i.test(accessEvidence));
} else {
  await chmod(root, 0o700);
  assert.equal((await stat(root)).mode & 0o777, 0o700);
  accessEvidence = "owner-only mode 0700";
}
const tools = process.env.MONGODB_TOOLS_DIR;
assert.ok(tools, "Set MONGODB_TOOLS_DIR to the portable tools bin directory");
const binary = (name: string) =>
  path.join(tools, name + (process.platform === "win32" ? ".exe" : ""));
const version = (await execute(binary("mongodump"), ["--version"])).stdout;
assert.match(version, /100\./);
const restoreVersion = (await execute(binary("mongorestore"), ["--version"])).stdout;
assert.equal(
  restoreVersion.split("\n")[0]?.replace("mongorestore", "mongodump"),
  version.split("\n")[0],
);
const source = createDatabase({ DATABASE_URL: localUrl(sourceName) });
const target = createDatabase({ DATABASE_URL: localUrl(targetName) });
await source.ready();
await target.ready();
const sourceSchema = await migrateDatabase(source, "apply");
assert.deepEqual(sourceSchema.conflicts, []);
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
async function snapshot(db: typeof source) {
  const listing = await db.connection.db!.command({ listCollections: 1, nameOnly: true });
  const collections = (listing.cursor as { firstBatch: { name: string }[] }).firstBatch
    .map((x) => x.name)
    .sort();
  const result: Record<string, { documents: unknown[]; indexes: unknown[] }> = {};
  for (const name of collections) {
    const documents = await db.connection.db!.command({ find: name, filter: {}, batchSize: 100 });
    const indexes = await db.connection.db!.command({
      listIndexes: name,
      cursor: { batchSize: 100 },
    });
    assert.ok(
      (documents.cursor as { firstBatch: unknown[] }).firstBatch.length < 100,
      "Synthetic snapshot batch bound exceeded",
    );
    assert.ok((indexes.cursor as { firstBatch: unknown[] }).firstBatch.length < 100);
    result[name] = {
      documents: (documents.cursor as { firstBatch: unknown[] }).firstBatch.sort((a, b) =>
        canonical(a).localeCompare(canonical(b)),
      ),
      // Compound index key order is significant; preserve it as an array.
      indexes: (indexes.cursor as { firstBatch: Record<string, unknown>[] }).firstBatch
        .map((index) => ({ ...index, key: Object.entries(index.key as Record<string, unknown>) }))
        .sort((a, b) => canonical(a).localeCompare(canonical(b))),
    };
  }
  return result;
}
async function archive(args: string[], input?: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(binary(input ? "mongorestore" : "mongodump"), args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const output: Buffer[] = [];
    let bytes = 0;
    let diagnostic = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("Database tool exceeded 60 seconds"));
    }, 60000);
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 16 * 1024 * 1024) {
        child.kill();
        reject(Error("Synthetic archive bound exceeded"));
      } else output.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      diagnostic += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(output));
      else reject(Error(`Database tool failed (${code}): ${diagnostic.slice(-1500)}`));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
try {
  assert.deepEqual(await snapshot(target), {});
  const department = await source.Department.create({ name: "Synthetic department" });
  const program = await source.Program.create({
    code: "DR",
    name: "Synthetic program",
    departmentId: department.id,
  });
  const alumni = await source.Alumni.create({
    studentNumber: "DR-001",
    isTracked: true, // The fixture below records a matching initial tracked event.
    firstName: "Synthetic",
    lastName: "Recovery",
    programId: program.id,
    gender: "Female",
  });
  await source.Employment.create({ alumniId: alumni.id, employer: "Synthetic employer" });
  const event = await source.TrackingEvent.create({ alumniId: alumni.id, isTracked: true });
  const contents = Buffer.from("studentNumber,result\nDR-001,synthetic recovery file\n");
  await source.EvidenceFile.create({
    alumniId: alumni.id,
    trackingEventId: event.id,
    provider: "local",
    storageKey: "evidence.csv",
    originalName: "evidence.csv",
    mimeType: "text/csv",
    sizeBytes: contents.length,
  });
  const formPayload = {
    studentNumber: "DR-001",
    graduationYear: 2024,
    firstName: "Synthetic",
    lastName: "Recovery",
    gender: "Female",
    departmentName: "Synthetic department",
    programCode: "DR",
  };
  await acceptFormsSubmission(source, "recovery-form-response-001", formPayload);
  const before = await snapshot(source);
  const recoveryPoint = new Date().toISOString();
  const dumpStart = performance.now();
  const dump = await archive([
    "--uri",
    localUrl(sourceName),
    "--archive",
    "--gzip",
    "--numParallelCollections=1",
  ]);
  const backupMs = performance.now() - dumpStart;
  const runtimeFiles: Record<string, string> = {};
  const runtimeNames = [
    "package.json",
    "pnpm-lock.yaml",
    "packages/db/src/models.ts",
    "packages/db/src/migration.ts",
    "packages/db/src/serialization.ts",
  ];
  async function collect(relative: string): Promise<void> {
    for (const entry of await readdir(path.join(projectRoot, relative), { withFileTypes: true })) {
      assert.ok(!entry.isSymbolicLink(), "Do not follow artifact symlinks");
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) await collect(name);
      else if (entry.isFile()) runtimeNames.push(name);
    }
  }
  await collect("apps/server/dist");
  await collect("apps/web/dist");
  let runtimeBytes = 0;
  for (const name of runtimeNames) {
    runtimeBytes += (await stat(path.join(projectRoot, name))).size;
    assert.ok(runtimeBytes <= 64 * 1024 * 1024, "Local runtime artifact bound exceeded");
    runtimeFiles[name] = (await readFile(path.join(projectRoot, name))).toString("base64");
  }
  const packageBytes = Buffer.from(
    JSON.stringify({
      archive: dump.toString("base64"),
      files: { "evidence.csv": contents.toString("base64") },
      runtimeFiles,
    }),
  );
  const key = randomBytes(32),
    iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`collab-recovery-v1:${sourceName}`));
  const encrypted = Buffer.concat([
    iv,
    cipher.update(packageBytes),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  await mkdir(path.join(root, "keys"), { mode: 0o700 });
  await mkdir(path.join(root, "backup"), { mode: 0o700 });
  await writeFile(path.join(root, "keys", "archive.key"), key, { flag: "wx", mode: 0o600 });
  await writeFile(path.join(root, "backup", "snapshot.aesgcm"), encrypted, {
    flag: "wx",
    mode: 0o600,
  });
  // One post-backup write demonstrates the recovery point boundary explicitly.
  await source.Alumni.create({
    studentNumber: "DR-AFTER",
    firstName: "After",
    lastName: "Backup",
    programId: program.id,
  });
  const recoveryStart = performance.now();
  const saved = await readFile(path.join(root, "backup", "snapshot.aesgcm"));
  const corrupted = Buffer.from(saved);
  corrupted[20] = corrupted[20]! ^ 1;
  const tampered = createDecipheriv("aes-256-gcm", key, corrupted.subarray(0, 12));
  tampered.setAAD(Buffer.from(`collab-recovery-v1:${sourceName}`));
  tampered.setAuthTag(corrupted.subarray(-16));
  tampered.update(corrupted.subarray(12, -16));
  assert.throws(() => tampered.final(), /authenticate|authentic/i);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    await readFile(path.join(root, "keys", "archive.key")),
    saved.subarray(0, 12),
  );
  decipher.setAAD(Buffer.from(`collab-recovery-v1:${sourceName}`));
  decipher.setAuthTag(saved.subarray(-16));
  const restoredPackage = JSON.parse(
    Buffer.concat([decipher.update(saved.subarray(12, -16)), decipher.final()]).toString(),
  ) as { archive: string; files: Record<string, string>; runtimeFiles: Record<string, string> };
  assert.deepEqual(await snapshot(target), {});
  await archive(
    [
      "--uri",
      "mongodb://127.0.0.1:27018/?replicaSet=rs0",
      "--archive",
      "--gzip",
      "--nsInclude",
      `${sourceName}.*`,
      "--nsFrom",
      `${sourceName}.*`,
      "--nsTo",
      `${targetName}.*`,
      "--stopOnError",
      "--numParallelCollections=1",
    ],
    Buffer.from(restoredPackage.archive, "base64"),
  );
  const restoredFiles = path.join(root, "restored-files");
  await mkdir(restoredFiles, { mode: 0o700 });
  for (const [name, encoded] of Object.entries(restoredPackage.files)) {
    assert.equal(path.basename(name), name);
    await writeFile(path.join(restoredFiles, name), Buffer.from(encoded, "base64"), {
      flag: "wx",
      mode: 0o600,
    });
  }
  const restoredRuntime = path.join(root, "restored-runtime");
  for (const [name, encoded] of Object.entries(restoredPackage.runtimeFiles)) {
    const destination = path.resolve(restoredRuntime, name);
    assert.ok(destination.startsWith(restoredRuntime + path.sep));
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await writeFile(destination, Buffer.from(encoded, "base64"), { flag: "wx", mode: 0o600 });
    assert.equal(
      createHash("sha256")
        .update(await readFile(destination))
        .digest("hex"),
      createHash("sha256").update(Buffer.from(runtimeFiles[name]!, "base64")).digest("hex"),
    );
  }
  assert.equal(canonical(await snapshot(target)), canonical(before));
  assert.equal(
    (await acceptFormsSubmission(target, "recovery-form-response-001", formPayload)).replayed,
    true,
  );
  assert.equal(canonical(await snapshot(target)), canonical(before));
  const restored = await target.Alumni.findById(alumni._id).lean().orFail();
  const restoredProgram = await target.Program.findById(restored.programId).lean().orFail();
  assert.equal(restoredProgram.departmentId.toHexString(), department._id.toHexString());
  assert.equal(await target.Employment.countDocuments({ alumniId: alumni._id }), 1);
  assert.equal(await target.TrackingEvent.countDocuments({ alumniId: alumni._id }), 1);
  const evidence = await target.EvidenceFile.findOne({ alumniId: alumni._id }).lean().orFail();
  assert.equal(evidence.trackingEventId?.toHexString(), event._id.toHexString());
  assert.deepEqual(
    await readPrivateFile(
      { uploadDir: restoredFiles },
      { ...toEntity(evidence), url: evidence.url ?? null },
    ),
    contents,
  );
  assert.equal(await target.Alumni.countDocuments(), 1);
  assert.equal(await source.Alumni.countDocuments(), 2);
  await assert.rejects(
    () =>
      target.Alumni.create({
        studentNumber: "DR-001",
        firstName: "Duplicate",
        lastName: "Test",
        programId: program.id,
      }),
    /E11000|duplicate key/i,
  );
  const result = {
    date: new Date().toISOString(),
    sourceName,
    targetName,
    toolsVersion: version.split("\n")[0],
    serverVersion: (await source.connection.db!.command({ buildInfo: 1 })).version,
    backupMs,
    recoveryMs: performance.now() - recoveryStart,
    recoveryPoint,
    collections: Object.keys(before).length,
    documents: Object.values(before).reduce((n, x) => n + x.documents.length, 0),
    indexDefinitions: Object.values(before).reduce((n, x) => n + x.indexes.length, 0),
    runtimeFileCount: runtimeNames.length,
    runtimeBytes,
    tamperRejected: true,
    integrity:
      "all documents and index definitions equal; relations/file/runtime hashes pass; duplicate index rejects",
    access: "owner/SYSTEM protected local root; inherited broad access removed",
    backupSha256: createHash("sha256").update(encrypted).digest("hex"),
    postBackupDocumentRestored: false,
    restoredReplaySuppressed: true,
    limits: [
      "quiesced synthetic source; no online snapshot consistency claim",
      "same local server, clean namespace; not a machine/site-loss rehearsal",
      "complete built server/web directories restored for integrity, not launched; runtime/dependency installation and separately held production keys still required",
      "key directory separate from encrypted archive but same host; production off-host key custody not tested",
      "ACL inspected, no second OS identity login test",
    ],
  };
  await writeFile(path.join(root, "result.json"), JSON.stringify(result, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await source.disconnect();
  await target.disconnect();
}
