import type { IndexOptions } from "mongoose";
import type { Database } from "./index";
import { schemas } from "./models";

export type MigrationMode = "dry-run" | "apply" | "rollback";
export interface ExistingIndex {
  name?: string;
  key: Record<string, unknown>;
  unique?: boolean;
  sparse?: boolean;
  partialFilterExpression?: unknown;
  collation?: unknown;
}
export interface PlannedIndex {
  collection: string;
  name: string;
  key: Record<string, 1 | -1>;
  unique: boolean;
  partialFilterExpression?: IndexOptions["partialFilterExpression"];
}
export interface IndexInspection extends PlannedIndex {
  state: "present" | "missing" | "conflict";
  reason?: string;
}
export interface MigrationReport {
  mode: MigrationMode;
  collections: string[];
  indexes: IndexInspection[];
  conflicts: string[];
  createdCollections: string[];
  createdIndexes: string[];
  departmentCodeIndex?: DepartmentCodeIndexReport;
  rollback: string;
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
function sameKey(a: Record<string, unknown>, b: Record<string, unknown>) {
  // Compound index order is significant.
  return JSON.stringify(Object.entries(a)) === JSON.stringify(Object.entries(b));
}
export function inspectIndex(plan: PlannedIndex, indexes: ExistingIndex[]): IndexInspection {
  const named = indexes.find((index) => index.name === plan.name);
  const keyed = indexes.filter((index) => sameKey(index.key, plan.key));
  const compatible = (index: ExistingIndex) =>
    sameKey(index.key, plan.key) &&
    Boolean(index.unique) === plan.unique &&
    !index.sparse &&
    (!index.collation || stable(index.collation) === stable({ locale: "simple" })) &&
    stable(index.partialFilterExpression) === stable(plan.partialFilterExpression);
  if (named && !compatible(named))
    return {
      ...plan,
      state: "conflict",
      reason: "Existing named index has different keys or enforcement options",
    };
  if (keyed.some(compatible)) return { ...plan, state: "present" };
  if (named || keyed.length)
    return {
      ...plan,
      state: "conflict",
      reason: "Existing key pattern has incompatible uniqueness, partial filter or collation",
    };
  return { ...plan, state: "missing" };
}
export function plannedIndexes(): PlannedIndex[] {
  return Object.entries(schemas).flatMap(([collection, schema]) =>
    schema.indexes().map(([key, options]) => {
      const entries: [string, 1 | -1][] = Object.entries(key).map(([field, direction]) => {
        if (direction !== 1 && direction !== -1)
          throw new Error("Unsupported migration index direction");
        return [field, direction];
      });
      if (!options.name) throw new Error("Every migration index must have an explicit name");
      return {
        collection,
        name: options.name,
        key: Object.fromEntries(entries),
        unique: Boolean(options.unique),
        ...(options.partialFilterExpression
          ? { partialFilterExpression: options.partialFilterExpression }
          : {}),
      };
    }),
  );
}

export interface DepartmentCodeIndexReport {
  state: "absent" | "retire" | "restore" | "present" | "conflict";
  definition?: Record<string, unknown>;
  reason?: string;
}
const departmentCodeIndex = { collection: "Department", name: "Department_code_key", key: { code: 1 }, unique: true } as const;
const backupId = "retired-Department_code_key";
type NativeDatabase = NonNullable<Database["connection"]["db"]>;

/** Only this reviewed legacy index may be retired; preserve its full definition before dropping. */
export async function migrateDepartmentCodeIndex(native: NativeDatabase, mode: MigrationMode): Promise<DepartmentCodeIndexReport> {
  const names = (await native.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name);
  if (!names.includes("Department")) return { state: "absent" };
  const collection = native.collection("Department");
  const indexes = await collection.listIndexes().toArray();
  const existing = indexes.find((index) => index.name === departmentCodeIndex.name);
  if (indexes.some((index) => index.name !== departmentCodeIndex.name && index.unique && sameKey(index.key, departmentCodeIndex.key)))
    return { state: "conflict", reason: "An unreviewed unique department code index exists; no index changed." };
  if (existing && inspectIndex(departmentCodeIndex, [existing]).state !== "present")
    return { state: "conflict", reason: "Department_code_key differs from the reviewed legacy definition; no index changed." };
  const backups = native.collection<{ _id: string; definition: Record<string, unknown> }>("MigrationIndexBackup");
  const backup = names.includes("MigrationIndexBackup") ? await backups.findOne({ _id: backupId }) : null;
  if (mode === "rollback") {
    if (existing) return { state: "present", definition: existing };
    if (!backup) return { state: "absent" };
    if (inspectIndex(departmentCodeIndex, [backup.definition as unknown as ExistingIndex]).state !== "present")
      return { state: "conflict", reason: "Saved department index definition failed validation; no index changed." };
    const duplicates = await collection.aggregate([
      { $group: { _id: "$code", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }, { $limit: 1 },
    ]).toArray();
    if (duplicates.length) return { state: "conflict", reason: "Department codes contain duplicate or missing values; rollback requires an operator-reviewed data plan. No records changed." };
    const { key, v: _v, ns: _ns, ...options } = backup.definition;
    await collection.createIndex(key as Record<string, 1 | -1>, options as Parameters<typeof collection.createIndex>[1]);
    return { state: "restore", definition: backup.definition };
  }
  if (!existing) return { state: "absent", ...(backup ? { definition: backup.definition } : {}) };
  if (backup && stable(backup.definition) !== stable(existing))
    return { state: "conflict", reason: "Saved department index definition differs from the live index; no index changed." };
  if (mode === "apply") {
    await backups.updateOne({ _id: backupId }, { $setOnInsert: { definition: existing } }, { upsert: true });
    await collection.dropIndex(departmentCodeIndex.name);
  }
  return { state: "retire", definition: existing };
}

/** Preserves records and unrelated indexes; only Department_code_key has an explicit retirement. */
export async function migrateDatabase(
  db: Database,
  mode: MigrationMode = "dry-run",
): Promise<MigrationReport> {
  await db.ready();
  const native = db.connection.db;
  if (!native) throw new Error("Database connection is not ready");
  const collections = (await native.listCollections({}, { nameOnly: true }).toArray()).map(
    ({ name }) => name,
  );
  const report: MigrationReport = {
    mode,
    collections,
    indexes: [],
    conflicts: [],
    createdCollections: [],
    createdIndexes: [],
    rollback:
      "Pause writers and run --rollback to restore the backed-up Department_code_key if all code values (including missing values) remain unique. Rollback never edits records; multiple new code-free departments require an operator-reviewed data plan before restoring the old artifact. Other additive collections and indexes remain intact.",
  };
  report.departmentCodeIndex = await migrateDepartmentCodeIndex(native, mode === "rollback" ? "rollback" : "dry-run");
  if (report.departmentCodeIndex.state === "conflict") report.conflicts.push(report.departmentCodeIndex.reason!);
  if (mode === "rollback") return report;
  for (const collection of Object.keys(schemas)) {
    const existing = collections.includes(collection)
      ? await native.collection(collection).listIndexes().toArray()
      : [];
    for (const plan of plannedIndexes().filter((index) => index.collection === collection)) {
      const inspection = inspectIndex(plan, existing);
      report.indexes.push(inspection);
      if (inspection.state === "conflict")
        report.conflicts.push(`${collection}.${plan.name}: ${inspection.reason}`);
      if (inspection.state === "missing" && plan.unique && collections.includes(collection)) {
        const group = Object.fromEntries(Object.keys(plan.key).map((key) => [key, `$${key}`]));
        const duplicates = await native
          .collection(collection)
          .aggregate<{ groups: number }>(
            [
              ...(plan.partialFilterExpression ? [{ $match: plan.partialFilterExpression }] : []),
              { $group: { _id: group, count: { $sum: 1 } } },
              { $match: { count: { $gt: 1 } } },
              { $count: "groups" },
            ],
            { allowDiskUse: true },
          )
          .toArray();
        if (duplicates.length)
          report.conflicts.push(
            `${collection}.${plan.name}: ${duplicates[0]!.groups} duplicate key group(s); values withheld`,
          );
      }
    }
  }
  if (mode !== "apply" || report.conflicts.length) return report;
  // Preflight the complete plan before writing anything. A subsequent concurrent
  // writer or index failure still fails closed; prior additions remain harmless.
  for (const name of Object.keys(schemas)) {
    if (!collections.includes(name)) {
      await native.createCollection(name);
      report.createdCollections.push(name);
    }
  }
  for (const index of report.indexes.filter((item) => item.state === "missing")) {
    await native
      .collection(index.collection)
      .createIndex(index.key, {
        name: index.name,
        unique: index.unique,
        ...(index.partialFilterExpression
          ? { partialFilterExpression: index.partialFilterExpression }
          : {}),
      });
    report.createdIndexes.push(`${index.collection}.${index.name}`);
  }
  report.departmentCodeIndex = await migrateDepartmentCodeIndex(native, "apply");
  if (report.departmentCodeIndex.state === "conflict") report.conflicts.push(report.departmentCodeIndex.reason!);
  return report;
}
