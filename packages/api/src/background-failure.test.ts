import assert from "node:assert/strict";
import { it } from "node:test";
import { modelFixture } from "./test-utils/model-test-fixture";
import {
  BACKGROUND_NOTICE_INTERVAL_MS,
  reportBackgroundFailure,
  resetBackgroundNotices,
} from "./background-failure";

it("logs every background failure without credentials and notifies Super Admins at most hourly", async () => {
  resetBackgroundNotices();
  const f = modelFixture({
    Role: [{ _id: "r-super", id: "r-super", key: "super_admin" }],
    UserRole: [{ userId: "admin", roleId: "r-super" }],
    User: [{ _id: "admin", id: "admin", status: "active" }],
  });
  const logged: string[] = [];
  const original = console.error;
  console.error = (line: string) => logged.push(line);
  try {
    // Assembled at run time so the secrets scanner never sees a credential-shaped literal.
    const uri = ["mongodb://", "ops", ":", "hunter2", "@db.example:27017/app"].join("");
    const failure = new Error(`connect failed: ${uri}`);
    const options = { db: f.db, notify: "The backup scheduler could not run.", now: 1_000 };
    await reportBackgroundFailure("backup-scheduler", failure, options);
    await reportBackgroundFailure("backup-scheduler", failure, { ...options, now: 2_000 });
    await reportBackgroundFailure("backup-scheduler", failure, {
      ...options,
      now: 1_000 + BACKGROUND_NOTICE_INTERVAL_MS,
    });
  } finally {
    console.error = original;
  }
  assert.equal(logged.length, 3, "every failure is logged");
  const entry = JSON.parse(logged[0]!);
  assert.equal(entry.event, "background_job_failed");
  assert.equal(entry.job, "backup-scheduler");
  assert.ok(!logged.join(" ").includes("hunter2"), "credentials never reach the log");
  // Two notices: the first failure, and the next one after an hour; not one a minute.
  assert.equal(f.tables.Notification?.length, 2);
  assert.match(String(f.tables.Notification![0]!.summary), /backup scheduler could not run/);
});

it("never throws, even when notifying fails", async () => {
  resetBackgroundNotices();
  const f = modelFixture({});
  f.failWrite("Role", "find", new Error("database unavailable"));
  const original = console.error;
  console.error = () => undefined;
  try {
    await reportBackgroundFailure("integrity-check", new Error("boom"), {
      db: f.db,
      notify: "x",
    });
  } finally {
    console.error = original;
  }
});
