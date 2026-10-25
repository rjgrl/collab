import assert from "node:assert/strict";
import { it } from "node:test";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { acceptFormsSubmission } from "./forms";
import { createHash } from "node:crypto";
import { mapFormPayload } from "../integrations/forms";
import { isIntegrationEnabled, listIntegrations } from "../integrations/registry";
const payload = {
  studentNumber: "FORMS-1",
  firstName: "Synthetic",
  lastName: "Test",
  gender: "Female",
  departmentName: "TEST",
  programCode: "TEST",
};
it("defaults Forms off without changing other integration defaults", async () => {
  const db = {
    IntegrationSetting: { findOne: () => query(null), find: () => query([]) },
  } as unknown as Database;
  assert.equal(await isIntegrationEnabled(db, "google_forms"), false);
  assert.equal(await isIntegrationEnabled(db, "google_auth"), true);
  const catalog = await listIntegrations(db, {});
  assert.equal(catalog.find((x) => x.key === "google_forms")?.enabled, false);
});
it("rejects missing/invalid submission keys before database work", async () => {
  for (const key of [undefined, "short", "a".repeat(129), "synthetic/key/invalid"])
    await assert.rejects(() => acceptFormsSubmission({} as Database, key, payload), /stable/);
});
it("rejects malformed form data before writing receipts", async () => {
  await assert.rejects(() =>
    acceptFormsSubmission({} as Database, "synthetic-response-001", {
      ...payload,
      gender: { $ne: null },
    }),
  );
});
it("replays a matching durable receipt without reapplying the import", async () => {
  const payloadHash = createHash("sha256")
    .update(JSON.stringify({ ...mapFormPayload(payload), isTracked: true }))
    .digest("hex");
  const db = {
    FormsReceipt: {
      findOne: () => query({ payloadHash, importJobId: "123456789012345678901234" }),
    },
  } as unknown as Database;
  const result = await acceptFormsSubmission(db, "synthetic-response-001", payload);
  assert.equal(result.replayed, true);
  assert.equal(result.importJobId, "123456789012345678901234");
});
it("returns a durable receipt on a retry and rejects changed business data", async () => {
  let receipt: { payloadHash: string; importJobId: string } | null = null;
  const db = {
    FormsReceipt: { findOne: () => query(receipt) },
    transaction: async () => {
      throw Error("Must not mutate an existing receipt");
    },
  } as unknown as Database;
  // A mismatched hash must reject rather than overwrite the original result.
  receipt = { payloadHash: "different", importJobId: "123456789012345678901234" };
  await assert.rejects(
    () => acceptFormsSubmission(db, "synthetic-response-001", payload),
    /different data/,
  );
});
it("bounds unresolved transaction conflicts and returns a safe retry error", async () => {
  let attempts = 0;
  const db = {
    FormsReceipt: { findOne: () => query(null) },
    transaction: async () => {
      attempts++;
      throw { code: 112 };
    },
  } as unknown as Database;
  await assert.rejects(
    () => acceptFormsSubmission(db, "synthetic-response-001", payload),
    /Retry with the same/,
  );
  assert.equal(attempts, 3);
});

function query<T>(value: T) {
  return Object.assign(Promise.resolve(value), {
    lean() {
      return this;
    },
    exec: async () => value,
  });
}
