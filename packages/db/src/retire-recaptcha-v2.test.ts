import assert from "node:assert/strict";
import { it } from "node:test";
import type { Database } from "./index";
import { hasLegacyRecaptchaKeys, retireRecaptchaV2 } from "./retire-recaptcha-v2";

type Row = Record<string, any>;
const legacy = (row: Row) => row.key === "recaptcha" && row.credentials?.secretKey !== undefined;

/** In-memory stand-in for the IntegrationSetting/AuditLog calls this step makes. */
function fakeDb(rows: Row[]) {
  const audit: Row[] = [];
  const db = {
    IntegrationSetting: {
      exists: async () => (rows.some(legacy) ? { _id: "x" } : null),
      findOne: () => ({ lean: async () => rows.find(legacy) ?? null }),
      updateOne: async (filter: Row, update: { $set: Row; $unset: Row }) => {
        const row = rows.find((item) => item._id === filter._id && legacy(item));
        if (!row) return { modifiedCount: 0 };
        Object.assign(row, update.$set);
        for (const field of Object.keys(update.$unset)) delete row[field];
        return { modifiedCount: 1 };
      },
    },
    AuditLog: { create: async (entry: Row) => void audit.push(entry) },
    transaction: async <T>(work: (tx: Database) => Promise<T>) => work(db as unknown as Database),
  };
  return { db: db as unknown as Database, audit };
}

const v2Row = () => ({
  _id: "r1",
  key: "recaptcha",
  enabled: true,
  credentials: { siteKey: { c: "sealed" }, secretKey: { c: "sealed" } },
  credentialHints: { secretKey: "1234" },
  keyFingerprint: "abcd1234",
});

it("dry-run reports an enabled v2 row without changing it", async () => {
  const rows = [v2Row()];
  const { db, audit } = fakeDb(rows);
  assert.equal(await hasLegacyRecaptchaKeys(db), true);
  assert.deepEqual(await retireRecaptchaV2(db, false), {
    found: true,
    wasEnabled: true,
    applied: false,
  });
  assert.deepEqual(rows[0], v2Row());
  assert.equal(audit.length, 0);
});

it("apply disables reCAPTCHA, erases v2 keys and audits once; a rerun is a no-op", async () => {
  const rows = [v2Row()];
  const { db, audit } = fakeDb(rows);
  assert.equal((await retireRecaptchaV2(db)).applied, true);
  const row = rows[0]!;
  assert.equal(row.enabled, false);
  assert.equal(row.credentials, undefined);
  assert.equal(row.credentialHints, undefined);
  assert.equal(row.keyFingerprint, undefined);
  assert.equal(audit.length, 1);
  assert.equal(audit[0]!.action, "integrations.disable");
  assert.match(audit[0]!.summary, /classic v2 keys erased/);
  assert.equal(await hasLegacyRecaptchaKeys(db), false);
  assert.deepEqual(await retireRecaptchaV2(db), {
    found: false,
    wasEnabled: false,
    applied: false,
  });
  assert.equal(audit.length, 1);
});

it("leaves Fraud Defense credentials and other integrations untouched", async () => {
  const enterprise = {
    _id: "r2",
    key: "recaptcha",
    enabled: true,
    credentials: { siteKey: {}, projectId: {}, apiKey: {} },
  };
  const other = { _id: "g1", key: "google_auth", enabled: true, credentials: { secretKey: {} } };
  const rows = [structuredClone(enterprise), structuredClone(other)];
  const { db, audit } = fakeDb(rows);
  assert.equal(await hasLegacyRecaptchaKeys(db), false);
  assert.equal((await retireRecaptchaV2(db)).applied, false);
  assert.deepEqual(rows, [enterprise, other]);
  assert.equal(audit.length, 0);
});
