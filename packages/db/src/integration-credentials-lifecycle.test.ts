import assert from "node:assert/strict";
import { it } from "node:test";
import type { Database } from "./index";
import { createIntegrationDefaults } from "./integration-defaults";
import { rotateIntegrationKey } from "./integration-key-rotation";
import { sealIntegrationCredentials } from "./integration-sealing";
import { credentialAad, keyFingerprint, open, type SealedValue } from "./secret-box";

type Row = Record<string, unknown>;
const exec = <T>(value: T) => ({
  exec: async () => value,
  lean: () => ({ exec: async () => value }),
});

/** Minimal in-memory stand-in for the two models these steps touch. */
function fakeDb(rows: Row[], users = 0) {
  const settings = rows;
  const model = {
    find: (filter: Row = {}) =>
      exec(
        settings.filter((row) => ("credentials" in filter ? row.credentials !== undefined : true)),
      ),
    countDocuments: () => exec(settings.length),
    insertMany: async (docs: Row[]) => {
      settings.push(...docs.map((doc) => ({ ...doc })));
    },
    deleteMany: (filter: Row) => {
      const before = settings.length;
      for (let index = settings.length - 1; index >= 0; index--) {
        const row = settings[index]!;
        if (row.notes === filter.notes && row.credentials === undefined) settings.splice(index, 1);
      }
      return exec({ deletedCount: before - settings.length });
    },
    findOneAndUpdate: (filter: Row, update: { $set: Row }) => {
      const row = settings.find((item) => item._id === filter._id);
      if (row) Object.assign(row, update.$set);
      return exec(row ?? null);
    },
  };
  const db = {
    IntegrationSetting: model,
    User: { countDocuments: () => exec(users) },
    transaction: async <T>(work: (tx: Database) => Promise<T>) => {
      const snapshot = structuredClone(settings);
      try {
        return await work(db as unknown as Database);
      } catch (error) {
        settings.splice(0, settings.length, ...snapshot);
        throw error;
      }
    },
  };
  return { db: db as unknown as Database, settings };
}

it("adds no integration rows to a fresh database", async () => {
  const { db, settings } = fakeDb([], 0);
  await createIntegrationDefaults(db, "apply");
  assert.deepEqual(settings, []);
});

it("makes the old implicit defaults explicit on an existing database", async () => {
  const { db, settings } = fakeDb([{ key: "google_drive", enabled: false, notes: "" }], 3);
  const plan = await createIntegrationDefaults(db, "dry-run");
  assert.equal(settings.length, 1);
  assert.equal(plan.keysAdded?.length, 6);
  await createIntegrationDefaults(db, "apply");
  const byKey = Object.fromEntries(settings.map((row) => [row.key, row.enabled]));
  assert.equal(byKey.google_drive, false, "existing rows are never modified");
  assert.equal(byKey.google_forms, false);
  for (const key of ["recaptcha", "google_auth", "email", "image_host", "google_sheets"])
    assert.equal(byKey[key], true, key);
  await createIntegrationDefaults(db, "rollback");
  assert.deepEqual(
    settings.map((row) => row.key),
    ["google_drive"],
  );
});

const oldKey = Buffer.from("5c".repeat(32), "hex");
const newKey = Buffer.from("6d".repeat(32), "hex");
function sealedRow(id: string, key: Buffer) {
  return {
    _id: id,
    key: "recaptcha",
    ...sealIntegrationCredentials(key, "recaptcha", {
      siteKey: "site-key-value-1",
      secretKey: "secret-key-value-2",
    }),
  };
}

it("re-seals every credential with the new key and updates the fingerprint", async () => {
  const { db, settings } = fakeDb([sealedRow("a", oldKey)]);
  const report = await rotateIntegrationKey(db, oldKey, newKey);
  assert.deepEqual(report.keysRotated, ["recaptcha"]);
  const row = settings[0]!;
  assert.equal(row.keyFingerprint, keyFingerprint(newKey));
  const credentials = row.credentials as Record<string, SealedValue>;
  assert.equal(
    open(newKey, credentialAad("recaptcha", "secretKey"), credentials.secretKey!),
    "secret-key-value-2",
  );
  assert.throws(() =>
    open(oldKey, credentialAad("recaptcha", "secretKey"), credentials.secretKey!),
  );
});

it("aborts without changes when any row was sealed with another key, and dry-run writes nothing", async () => {
  const good = sealedRow("a", oldKey);
  const foreign = sealedRow("b", Buffer.from("7e".repeat(32), "hex"));
  const { db, settings } = fakeDb([good, foreign]);
  const before = structuredClone(settings);
  await assert.rejects(() => rotateIntegrationKey(db, oldKey, newKey));
  assert.deepEqual(settings, before);

  const single = fakeDb([sealedRow("c", oldKey)]);
  const untouched = structuredClone(single.settings);
  await rotateIntegrationKey(single.db, oldKey, newKey, { dryRun: true });
  assert.deepEqual(single.settings, untouched);
});
