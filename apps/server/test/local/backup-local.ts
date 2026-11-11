import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { generate } from "otplib";
import { createDatabase } from "@Alumni-Tracking-Ss/db";
import { migrateDatabase } from "@Alumni-Tracking-Ss/db/migration";
import { seedDatabase } from "@Alumni-Tracking-Ss/db/seed-data";
import { createSession } from "@Alumni-Tracking-Ss/api/services/session";
import {
  bundlePath,
  createBackup,
  listBackups,
  verifyBackup,
  type BackupConfig,
} from "@Alumni-Tracking-Ss/api/backups/backup-service";
import { runSchedulerTick } from "@Alumni-Tracking-Ss/api/backups/scheduler";
import {
  maintenanceState,
  recoverInterruptedRestore,
  runRestore,
  setMaintenance,
} from "@Alumni-Tracking-Ss/api/backups/restore";
import { createApp } from "../../src/app";
import { adminCookie } from "./local-admin";
import { startCiReplicaSet } from "./ci-replica-set";

// Backup and restore against generated databases on the local rs0 replica set only.
if (process.env.NODE_ENV === "production") throw new Error("Synthetic local acceptance only.");
process.env.NODE_ENV = "test";
const suffix = randomBytes(6).toString("hex");
process.env.DATABASE_URL = `mongodb://127.0.0.1:27018/collab_backup_${suffix}?replicaSet=rs0`;
process.env.SEED_ADMIN_EMAIL = "synthetic-admin@example.test";
process.env.SEED_ADMIN_PASSWORD = randomBytes(24).toString("base64url");
process.env.SEED_DEMO_DATA = "true";
delete process.env.STAFF_EMAIL_DOMAINS;
delete process.env.INTEGRATION_ENCRYPTION_KEY;

const root = path.resolve(".tools", `backup-local-${suffix}`);
const keyHex = randomBytes(32).toString("hex");
const config: BackupConfig = {
  encryptionKey: keyHex,
  dir: path.join(root, "backups"),
  toolsDir:
    process.env.MONGODB_TOOLS_DIR ??
    path.resolve(".tools/mongodb-database-tools-windows-x86_64-100.20.1/bin"),
  databaseUrl: process.env.DATABASE_URL,
  uploadDir: path.join(root, "uploads"),
  appVersion: "1.0.0-test",
  mfaEncryptionKey: "12".repeat(32),
};
const stopCiReplicaSet = await startCiReplicaSet();
const db = createDatabase({ DATABASE_URL: process.env.DATABASE_URL });
const actor = {
  id: "000000000000000000000000",
  name: "Synthetic Admin",
  email: "admin@example.test",
};
const ignored = new Set(["BackupState", "Session", "AuditLog", "AuthThrottle", "MfaCredential"]);

async function snapshot() {
  const native = db.connection.db!;
  const out: Record<string, string> = {};
  for (const { name } of await native.listCollections({}, { nameOnly: true }).toArray())
    if (!ignored.has(name))
      out[name] = JSON.stringify(await native.collection(name).find({}).sort({ _id: 1 }).toArray());
  const files: Record<string, string> = {};
  const walk = async (dir: string, prefix: string) => {
    if (!existsSync(dir)) return;
    for (const entry of await readdir(dir, { withFileTypes: true }))
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
      else files[prefix + entry.name] = await readFile(path.join(dir, entry.name), "utf8");
  };
  await walk(config.uploadDir, "");
  return { collections: out, files };
}

try {
  assert.ok(
    existsSync(config.toolsDir!),
    "Set MONGODB_TOOLS_DIR to the Database Tools bin folder.",
  );
  assert.deepEqual((await migrateDatabase(db, "apply")).conflicts, []);
  await seedDatabase(db);
  await mkdir(path.join(config.uploadDir, "evidence"), { recursive: true });
  await writeFile(path.join(config.uploadDir, "evidence", "proof.txt"), "original evidence");
  await writeFile(path.join(config.uploadDir, "photo.txt"), "original photo");

  // 1. Backup: succeeded, verified, no plaintext and no key material in the file.
  const backup = await createBackup({ db, config, type: "manual", createdBy: actor.name });
  assert.equal(backup.status, "succeeded");
  assert.equal(backup.verified, true);
  assert.ok(backup.manifest!.collections.User! > 0);
  assert.equal(backup.manifest!.files, 2);
  const bytes = await readFile(bundlePath(config.dir!, backup.backupId));
  for (const plain of ["original evidence", process.env.SEED_ADMIN_EMAIL, keyHex, ".env"])
    assert.ok(!bytes.includes(Buffer.from(plain)), "backup contains plaintext or key material");
  const original = await snapshot();

  // 2. A corrupted copy fails verification.
  const tampered = Buffer.from(bytes);
  tampered[tampered.length - 100]! ^= 1;
  const corruptId = "20000101000000-deadbeef";
  await writeFile(bundlePath(config.dir!, corruptId), tampered);
  await assert.rejects(() => verifyBackup(config, corruptId));
  await rm(bundlePath(config.dir!, corruptId));

  // 3. Mutate data and files, then restore: everything matches the backup again.
  await db.User.updateMany({}, { $set: { name: "Mutated after backup" } }).exec();
  await db.College.deleteMany({}).exec();
  await writeFile(path.join(config.uploadDir, "evidence", "proof.txt"), "changed evidence");
  await writeFile(path.join(config.uploadDir, "extra.txt"), "new file");
  const mutated = await snapshot();
  assert.notDeepEqual(mutated, original);
  const restored = await runRestore({
    db,
    config,
    backupId: backup.backupId,
    actor,
    lockOwner: "local-test",
  });
  assert.equal(restored.result, "restored");
  assert.deepEqual(await snapshot(), original);
  assert.equal(await db.Session.countDocuments().exec(), 0, "sessions are invalidated");
  assert.equal((await maintenanceState(db)).active, false);
  assert.ok(
    await db.AuditLog.exists({ action: "backups.restore", entityId: backup.backupId }),
    "the restore is audited after the audit log itself was restored",
  );
  const log = await readFile(path.join(config.dir!, "restore-log.jsonl"), "utf8");
  assert.match(log, /"event":"restore.finish".*"result":"restored"/);

  // 4. A failure after the database step rolls back to the pre-restore backup.
  await db.User.updateMany({}, { $set: { name: "State before failed restore" } }).exec();
  const beforeFailure = await snapshot();
  const failed = await runRestore({
    db,
    config,
    backupId: backup.backupId,
    actor,
    lockOwner: "local-test",
    failAt: "files",
  });
  assert.equal(failed.result, "rolled back");
  assert.equal(failed.failedStep, "files");
  assert.deepEqual(await snapshot(), beforeFailure);
  assert.equal((await maintenanceState(db)).active, false);
  assert.ok((await listBackups(config)).some((entry) => entry.type === "pre-restore"));

  // 5. Two server instances ticking the same due slot run one scheduled backup.
  await db.BackupState.updateOne(
    { _id: "schedule" },
    { $set: { frequency: "daily", time: "00:00", weekday: 0, retention: 1 } },
    { upsert: true },
  ).exec();
  const ticks = await Promise.all([
    runSchedulerTick({ db, config, owner: "instance-a" }),
    runSchedulerTick({ db, config, owner: "instance-b" }),
  ]);
  assert.equal(ticks.filter(Boolean).length, 1);
  assert.equal((await listBackups(config)).filter((entry) => entry.type === "scheduled").length, 1);

  // 6. HTTP: non-administrators and unverified administrator sessions get 403.
  const app = createApp({
    db,
    config: { nodeEnv: "test", origin: "http://localhost:3001" },
    integrationEnv: { mfaEncryptionKey: config.mfaEncryptionKey },
    backup: config,
  });
  const faculty = await db.User.findOne({ email: "faculty.it@collab.test" }).orFail().lean();
  const facultyCookie = `ats_session=${(await createSession(db, String(faculty._id), {})).token}`;
  const admin = await db.User.findOne({ email: process.env.SEED_ADMIN_EMAIL }).orFail().lean();
  const unverified = `ats_session=${(await createSession(db, String(admin._id), {})).token}`;
  for (const cookie of [facultyCookie, unverified]) {
    assert.equal((await request(app).get("/api/backups").set("Cookie", cookie)).status, 403);
    assert.equal(
      (
        await request(app)
          .post("/api/backups")
          .set("Cookie", cookie)
          .set("Origin", "http://localhost:3001")
      ).status,
      403,
    );
  }
  const verified = await adminCookie(db);
  const overview = await request(app).get("/api/backups").set("Cookie", verified);
  assert.equal(overview.status, 200);
  assert.ok(!JSON.stringify(overview.body).includes(keyHex));

  // 7. A backup exported from another server/catalog can be uploaded, verified and catalogued.
  const exportConfig = { ...config, dir: path.join(root, "exported-backups") };
  const exported = await createBackup({
    db,
    config: exportConfig,
    type: "manual",
    createdBy: actor.name,
  });
  const exportedPath = bundlePath(exportConfig.dir, exported.backupId);
  const imported = await request(app)
    .post("/api/backups/import")
    .set("Cookie", verified)
    .set("Origin", "http://localhost:3001")
    .attach("backup", exportedPath, `${exported.backupId}.atsbak`);
  assert.equal(imported.status, 201, JSON.stringify(imported.body));
  assert.equal(imported.body.backupId, exported.backupId);
  assert.equal(imported.body.verified, true);
  assert.ok((await listBackups(config)).some((entry) => entry.backupId === exported.backupId));
  const duplicate = await request(app)
    .post("/api/backups/import")
    .set("Cookie", verified)
    .set("Origin", "http://localhost:3001")
    .attach("backup", exportedPath, `${exported.backupId}.atsbak`);
  assert.equal(duplicate.status, 409);
  assert.equal((await verifyBackup(config, exported.backupId)).backupId, exported.backupId);

  // 8. Maintenance mode: non-Super-Admin API requests get 503; administrators and sign-in pass.
  await setMaintenance(db, true);
  const blocked = await request(app).get("/api/dashboard").set("Cookie", facultyCookie);
  assert.equal(blocked.status, 503);
  assert.match(blocked.body.error, /restored from a backup/);
  assert.equal(
    (await request(app).get("/api/backups/restore").set("Cookie", verified)).status,
    200,
  );
  assert.notEqual((await request(app).get("/api/auth/config")).status, 503);
  for (const route of ["/api/auth/signup", "/api/auth/password-reset-requests"])
    assert.equal((await request(app).post(route).send({})).status, 503, route);

  // A fresh server recognizes a restore left running by a dead process, releases the stale lock,
  // keeps maintenance on, and lets a verified Super Admin end it after checking the database.
  await db.BackupState.updateOne(
    { _id: "restore" },
    {
      $set: {
        status: "running",
        step: "database",
        lockOwner: "dead-instance",
        heartbeatAt: new Date(Date.now() - 60_000),
      },
    },
    { upsert: true },
  ).exec();
  await db.BackupState.updateOne(
    { _id: "lock" },
    {
      $set: {
        kind: "restore",
        owner: "dead-instance",
        lockedUntil: new Date(Date.now() + 60 * 60_000),
      },
    },
    { upsert: true },
  ).exec();
  // A recent heartbeat means the restore may still be running elsewhere: leave it alone.
  assert.equal(await recoverInterruptedRestore(db), false);
  await db.BackupState.updateOne(
    { _id: "restore" },
    { $set: { heartbeatAt: new Date(Date.now() - 10 * 60_000) } },
  ).exec();
  assert.equal(await recoverInterruptedRestore(db), true);
  assert.equal((await maintenanceState(db)).active, true);
  assert.equal(
    (
      await request(app)
        .post("/api/backups/maintenance/end")
        .set("Cookie", verified)
        .set("Origin", "http://localhost:3001")
    ).status,
    200,
  );
  assert.equal((await maintenanceState(db)).active, false);
  assert.notEqual(
    (await request(app).get("/api/dashboard").set("Cookie", facultyCookie)).status,
    503,
  );

  // 9. Submit a real restore through HTTP with a freshly generated authenticator code.
  await db.MfaCredential.deleteMany({ userId: admin._id }).exec();
  await db.Session.deleteMany({ userId: admin._id }).exec();
  const enrollmentCookie = `ats_session=${(await createSession(db, String(admin._id), {})).token}`;
  const enrollment = await request(app)
    .post("/api/auth/mfa/enrollments")
    .set("Cookie", enrollmentCookie)
    .set("Origin", "http://localhost:3001")
    .send({ password: process.env.SEED_ADMIN_PASSWORD });
  assert.equal(enrollment.status, 200, JSON.stringify(enrollment.body));
  const secret = String(enrollment.body.secret);
  const confirmation = await request(app)
    .post("/api/auth/mfa/confirmations")
    .set("Cookie", enrollmentCookie)
    .set("Origin", "http://localhost:3001")
    .send({ code: await generate({ secret }) });
  assert.equal(confirmation.status, 200, JSON.stringify(confirmation.body));
  const setCookie = confirmation.headers["set-cookie"];
  assert.ok(Array.isArray(setCookie) && setCookie[0]);
  const restoreCookie = String(setCookie[0]).split(";", 1)[0]!;
  // Enrollment consumed the current TOTP time step. Reset only the replay marker so this test can
  // exercise a fresh step-up without sleeping for the next 30-second window.
  await db.MfaCredential.updateOne({ userId: admin._id }, { $set: { lastStep: -1 } }).exec();
  const httpBackup = await createBackup({ db, config, type: "manual", createdBy: actor.name });
  const beforeHttpRestore = await db.User.findById(admin._id).lean().orFail();
  await db.User.updateOne({ _id: admin._id }, { $set: { name: "HTTP restore mutation" } }).exec();
  const submission = await request(app)
    .post(`/api/backups/${httpBackup.backupId}/restore`)
    .set("Cookie", restoreCookie)
    .set("Origin", "http://localhost:3001")
    .send({ confirmation: "RESTORE", code: await generate({ secret }) });
  assert.equal(submission.status, 202, JSON.stringify(submission.body));
  const deadline = Date.now() + 120_000;
  let terminal = "running";
  while (Date.now() < deadline) {
    terminal = String((await db.BackupState.findById("restore").lean())?.status ?? "missing");
    if (terminal !== "running") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(terminal, "succeeded");
  assert.equal((await db.User.findById(admin._id).lean().orFail()).name, beforeHttpRestore.name);
  assert.equal(await db.Session.countDocuments().exec(), 0);
  console.log(
    "PASS backups: verified encrypted backup with no plaintext or key, corrupted copy rejected, restore matches backup and invalidates sessions, failed restore rolls back, one scheduled run across two instances, 403 for non-admin and unverified MFA.",
  );
} finally {
  await db.connection.dropDatabase().catch(() => undefined);
  await db.disconnect();
  await stopCiReplicaSet();
  await rm(root, { recursive: true, force: true });
}
