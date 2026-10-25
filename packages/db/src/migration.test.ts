import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectIndex, plannedIndexes, migrateDepartmentCodeIndex, type PlannedIndex } from "./migration";
import type { Database } from "./index";

describe("non-destructive index migration preflight", () => {
  const plan: PlannedIndex = {
    collection: "User",
    name: "User_alumniId_key",
    key: { alumniId: 1 },
    unique: true,
    partialFilterExpression: { alumniId: { $type: "objectId" } },
  };
  it("distinguishes missing indexes from conflicting existing enforcement", () => {
    assert.equal(inspectIndex(plan, []).state, "missing");
    assert.equal(
      inspectIndex(plan, [{ name: plan.name, key: plan.key, unique: true }]).state,
      "conflict",
    );
    assert.equal(
      inspectIndex(plan, [{ name: "unreviewed", key: plan.key, unique: false }]).state,
      "conflict",
    );
    assert.equal(
      inspectIndex(plan, [
        {
          name: plan.name,
          key: plan.key,
          unique: true,
          partialFilterExpression: plan.partialFilterExpression,
        },
      ]).state,
      "present",
    );
  });
  it("accepts compatible legacy names and preserves compound key order", () => {
    const compound: PlannedIndex = {
      collection: "Program",
      name: "Program_departmentId_code_key",
      key: { departmentId: 1, code: 1 },
      unique: true,
    };
    assert.equal(
      inspectIndex(compound, [{ name: "retained_legacy_name", key: compound.key, unique: true }])
        .state,
      "present",
    );
    assert.equal(
      inspectIndex(compound, [
        { name: compound.name, key: compound.key, unique: true, collation: { locale: "simple" } },
      ]).state,
      "present",
    );
    assert.equal(
      inspectIndex(compound, [
        {
          name: compound.name,
          key: compound.key,
          unique: true,
          collation: { locale: "en", strength: 2 },
        },
      ]).state,
      "conflict",
    );
    assert.equal(
      inspectIndex(compound, [
        { name: compound.name, key: { code: 1, departmentId: 1 }, unique: true },
      ]).state,
      "conflict",
    );
  });
  it("retains important legacy uniqueness and adds no automatic TTL index", () => {
    const indexes = plannedIndexes();
    for (const name of [
      "User_email_key",
      "Session_token_key",
      "Alumni_studentNumber_key",
      "RolePermission_roleId_permissionId_key",
      "FormsReceipt_keyHash_key",
    ])
      assert.ok(indexes.some((index) => index.name === name && index.unique));
    assert.ok(
      indexes.some((index) => index.name === "AuthThrottle_expiresAt_idx" && !index.unique),
    );
  });
});

describe("explicit department code index retirement", () => {
  const legacy = { name: "Department_code_key", key: { code: 1 }, unique: true, v: 2 };
  function fixture(indexes: Array<Record<string, unknown>> = [legacy]) {
    let backup: { _id: string; definition: Record<string, unknown> } | null = null;
    let duplicates: object[] = [];
    const writes: string[] = [];
    const native = {
      listCollections: () => ({ toArray: async () => [{ name: "Department" }, ...(backup ? [{ name: "MigrationIndexBackup" }] : [])] }),
      collection: (name: string) => name === "MigrationIndexBackup" ? {
        findOne: async () => backup,
        updateOne: async (_query: unknown, update: { $setOnInsert: { definition: Record<string, unknown> } }) => {
          writes.push("backup");
          backup ??= { _id: "retired-Department_code_key", ...update.$setOnInsert };
        },
      } : {
        listIndexes: () => ({ toArray: async () => indexes }),
        dropIndex: async (index: string) => {
          assert.equal(index, legacy.name);
          assert.ok(backup, "backup must be durable before the index is dropped");
          writes.push("drop");
          indexes = [];
        },
        aggregate: () => ({ toArray: async () => duplicates }),
        createIndex: async (key: object, options: object) => {
          writes.push("restore");
          indexes.push({ key, ...options });
        },
      },
    } as unknown as NonNullable<Database["connection"]["db"]>;
    return { native, writes, indexes: () => indexes, backup: () => backup, duplicate: () => { duplicates = [{}]; } };
  }
  it("previews without writes, backs up before retiring, and restores the original definition", async () => {
    const f = fixture();
    assert.equal((await migrateDepartmentCodeIndex(f.native, "dry-run")).state, "retire");
    assert.deepEqual(f.writes, []);
    assert.equal((await migrateDepartmentCodeIndex(f.native, "apply")).state, "retire");
    assert.deepEqual(f.writes, ["backup", "drop"]);
    assert.deepEqual(f.backup()?.definition, legacy);
    assert.equal((await migrateDepartmentCodeIndex(f.native, "apply")).state, "absent");
    assert.equal((await migrateDepartmentCodeIndex(f.native, "rollback")).state, "restore");
    assert.deepEqual(f.indexes(), [{ name: legacy.name, key: legacy.key, unique: true }]);
  });
  it("refuses unexpected index definitions and leaves unrelated indexes intact", async () => {
    for (const indexes of [[{ ...legacy, unique: false }], [{ ...legacy, key: { name: 1 } }]]) {
      const f = fixture(indexes);
      assert.equal((await migrateDepartmentCodeIndex(f.native, "apply")).state, "conflict");
      assert.deepEqual(f.writes, []);
    }
    const unreviewed = fixture([{ name: "unreviewed", key: { code: 1 }, unique: true }]);
    assert.equal((await migrateDepartmentCodeIndex(unreviewed.native, "apply")).state, "conflict");
    assert.deepEqual(unreviewed.writes, []);
    const f = fixture([{ name: "unrelated", key: { name: 1 }, unique: true }]);
    assert.equal((await migrateDepartmentCodeIndex(f.native, "apply")).state, "absent");
    assert.deepEqual(f.writes, []);
  });
  it("fails rollback safely when multiple code-free or duplicate-code departments exist", async () => {
    const f = fixture();
    await migrateDepartmentCodeIndex(f.native, "apply");
    f.duplicate();
    assert.equal((await migrateDepartmentCodeIndex(f.native, "rollback")).state, "conflict");
    assert.deepEqual(f.writes, ["backup", "drop"]);
    assert.deepEqual(f.indexes(), []);
  });
});
