import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, it } from "node:test";
import { modelFixture } from "../test-utils/model-test-fixture";
import { ToolError, failureReason, redactToolOutput, type CatalogEntry } from "./backup-service";
import { backupFreshness, checkBackupFreshness } from "./scheduler";

const entry = (createdAt: string, extra: Partial<CatalogEntry> = {}): CatalogEntry => ({
  backupId: `${createdAt.replace(/\D/g, "").slice(0, 14)}-0a1b2c3d`,
  createdAt,
  type: "scheduled",
  status: "succeeded",
  sizeBytes: 1,
  createdBy: "Scheduler",
  verified: true,
  ...extra,
});
const daily = { frequency: "daily" as const, time: "02:00", weekday: 0, retention: 7 };

it("measures freshness from the newest verified backup or the schedule change", () => {
  const now = new Date("2026-11-12T12:00:00Z");
  assert.equal(backupFreshness(daily, [entry("2026-11-11T18:00:00Z")], now).stale, false);
  assert.equal(backupFreshness(daily, [entry("2026-11-11T09:00:00Z")], now).stale, true);
  // A failed or unverified newer backup does not count.
  const failed = entry("2026-11-12T11:00:00Z", { status: "failed", verified: false });
  assert.equal(backupFreshness(daily, [failed, entry("2026-11-10T00:00:00Z")], now).stale, true);
  // A schedule saved recently gets a full window before its first backup.
  const fresh = { ...daily, scheduleChangedAt: new Date("2026-11-12T08:00:00Z") };
  assert.equal(backupFreshness(fresh, [], now).stale, false);
  assert.equal(backupFreshness({ ...daily, frequency: "off" }, [], now).stale, false);
  const weekly = { ...daily, frequency: "weekly" as const };
  assert.equal(backupFreshness(weekly, [entry("2026-11-06T00:00:00Z")], now).stale, false);
  assert.equal(backupFreshness(weekly, [entry("2026-11-04T00:00:00Z")], now).stale, true);
});

const dir = await mkdtemp(path.join(tmpdir(), "ats-fresh-"));
after(() => rm(dir, { recursive: true, force: true }));

it("alerts once per stale episode, and again only after a new good backup goes stale", async () => {
  const old = entry("2026-11-01T00:00:00Z");
  await writeFile(path.join(dir, `${old.backupId}.json`), JSON.stringify(old));
  const f = modelFixture({
    BackupState: [{ _id: "schedule", ...daily }],
    Role: [{ _id: "role-super", key: "super_admin" }],
    UserRole: [{ userId: "admin", roleId: "role-super" }],
    User: [{ _id: "admin", status: "active" }],
  });
  const config = { dir, databaseUrl: "x", uploadDir: dir, appVersion: "t" };
  const now = new Date("2026-11-12T00:00:00Z");
  assert.equal((await checkBackupFreshness({ db: f.db, config, now }))?.stale, true);
  await checkBackupFreshness({ db: f.db, config, now });
  assert.equal(f.tables.Notification?.length, 1, "one alert per episode across ticks");
  assert.match(String(f.tables.Notification![0]!.summary), /out of date.*daily schedule/);
  assert.equal(f.tables.AuditLog?.[0]?.action, "backups.stale");

  const newer = entry("2026-11-12T00:30:00Z");
  await writeFile(path.join(dir, `${newer.backupId}.json`), JSON.stringify(newer));
  assert.equal(
    (await checkBackupFreshness({ db: f.db, config, now: new Date("2026-11-12T06:00:00Z") }))
      ?.stale,
    false,
  );
  await checkBackupFreshness({ db: f.db, config, now: new Date("2026-11-14T00:00:00Z") });
  assert.equal(f.tables.Notification!.length, 2, "a new episode alerts again");
});

// Fake credentials are joined at runtime so the repository secret scanner does not flag them.
const fakeUri = (user: string, password: string, rest: string) =>
  ["mongodb://", user, ":", password, "@", rest].join("");

it("redacts credentials from tool output and keeps one short reason line", () => {
  const raw = [
    `2026-11-12T00:00:00 Failed: connection to ${fakeUri("admin", "S3cr3t", "db.example:27017/app?x=1")}`,
    "error: password=hunter2 rejected; token: abc.def",
  ].join("\n");
  const redacted = redactToolOutput(raw);
  for (const secret of ["S3cr3t", "hunter2", "abc.def", "admin:"])
    assert.ok(!redacted.includes(secret), secret);
  assert.match(redacted, /mongodb:\/\/\*\*\*@db\.example/);
  const reason = failureReason(new ToolError("mongorestore", 1, redacted));
  assert.match(reason, /^mongorestore failed with exit code 1\. error: password=\*\*\*/);
  assert.equal(
    failureReason(new Error(`${fakeUri("u", "p", "h/x")} broke`)),
    "mongodb://***@h/x broke",
  );
});
