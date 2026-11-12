import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createDatabase } from "@Alumni-Tracking-Ss/db";
import { migrateDatabase } from "@Alumni-Tracking-Ss/db/migration";
import { DatabaseNotEmptyError, initializeEmptyDatabase } from "@Alumni-Tracking-Ss/db/seed-data";
import { startCiReplicaSet } from "./ci-replica-set";

// deploy:init on generated databases only: clean, seeded, production, and refusal of non-empty.
const stopCiReplicaSet = await startCiReplicaSet();
const password = `Deploy ${randomBytes(9).toString("base64url")} 1!`;
const originalEnv = process.env.NODE_ENV;
const fresh = () =>
  createDatabase({
    DATABASE_URL: `mongodb://127.0.0.1:27018/collab_deployinit_${randomBytes(6).toString("hex")}?replicaSet=rs0`,
  });
async function init(db: ReturnType<typeof fresh>, demo: boolean) {
  await db.ready();
  await migrateDatabase(db, "apply");
  await initializeEmptyDatabase(db, { email: "Owner@Example.test", password, demo });
}
const created: ReturnType<typeof fresh>[] = [];
try {
  // Clean: exactly one Super Admin, no alumni, every integration disabled.
  const clean = fresh();
  created.push(clean);
  process.env.NODE_ENV = "production";
  await init(clean, false);
  const superAdmin = await clean.Role.findOne({ key: "super_admin" }).orFail().lean();
  assert.equal(await clean.User.countDocuments(), 1);
  assert.equal(await clean.User.countDocuments({ email: "owner@example.test" }), 1);
  assert.equal(await clean.UserRole.countDocuments({ roleId: superAdmin._id }), 1);
  assert.equal(await clean.Alumni.countDocuments(), 0);
  assert.equal(await clean.IntegrationSetting.countDocuments({ enabled: true }), 0);

  // Never touches a database that already has accounts.
  await assert.rejects(
    initializeEmptyDatabase(clean, { email: "other@example.test", password, demo: false }),
    DatabaseNotEmptyError,
  );
  assert.equal(await clean.User.countDocuments(), 1);

  // Demo data is refused in production, before anything is written.
  const refused = fresh();
  created.push(refused);
  await refused.ready();
  await assert.rejects(
    initializeEmptyDatabase(refused, { email: "owner@example.test", password, demo: true }),
    /refused in production/,
  );
  assert.equal(await refused.User.countDocuments(), 0);

  // Seeded (non-production): demo colleges, alumni and logins.
  process.env.NODE_ENV = "test";
  const seeded = fresh();
  created.push(seeded);
  await init(seeded, true);
  assert.ok((await seeded.Alumni.countDocuments()) >= 4);
  assert.ok((await seeded.User.countDocuments()) > 1);
  console.log("deploy:init local check: PASS");
} finally {
  process.env.NODE_ENV = originalEnv;
  for (const db of created) {
    await db.connection.dropDatabase().catch(() => undefined);
    await db.disconnect();
  }
  await stopCiReplicaSet();
}
