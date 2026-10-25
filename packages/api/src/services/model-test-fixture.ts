// Test-only Mongoose query double. Production services always use real models.
import type { Database } from "@Alumni-Tracking-Ss/db";
type Row = Record<string, unknown>;
export function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") return (expected as Row[]).some((part) => matches(row, part));
    if (key === "$and") return (expected as Row[]).every((part) => matches(row, part));
    const actual = key === "_id" ? (row._id ?? row.id) : row[key];
    if (
      expected &&
      typeof expected === "object" &&
      !Array.isArray(expected) &&
      !(expected instanceof Date)
    ) {
      return Object.entries(expected).every(([operator, value]) => {
        if (operator === "$in")
          return (value as unknown[]).some((item) => String(item) === String(actual));
        if (operator === "$ne") return String(actual) !== String(value);
        if (operator === "$exists") return (actual !== undefined) === value;
        if (operator === "$gt") return Number(actual) > Number(value);
        if (operator === "$gte") return Number(actual) >= Number(value);
        if (operator === "$lt") return Number(actual) < Number(value);
        if (operator === "$lte") return Number(actual) <= Number(value);
        if (operator === "$regex")
          return new RegExp(String(value), String((expected as Row).$options ?? "")).test(
            String(actual),
          );
        return operator === "$options";
      });
    }
    if (expected === null) return actual == null;
    if (actual instanceof Date && expected instanceof Date)
      return actual.getTime() === expected.getTime();
    if (Array.isArray(expected)) return JSON.stringify(actual) === JSON.stringify(expected);
    return actual === expected;
  });
}
export function query<T>(work: () => T | Promise<T>) {
  let failure: (() => Error) | undefined;
  const result = Promise.resolve().then(async () => {
    const value = await work();
    if (value == null && failure) throw failure();
    return value;
  });
  const q = Object.assign(result, {
    lean: () => q,
    sort: (_order: unknown) => q,
    skip: (_count: number) => q,
    limit: (_count: number) => q,
    select: (_fields: unknown) => q,
    orFail: (makeError: () => Error) => {
      failure = makeError;
      return q;
    },
    exec: () => result,
  });
  return q;
}
export function modelFixture(initial: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = initial;
  const operations: { model: string; method: string; filter?: Row; update?: Row }[] = [];
  const writeFailures = new Map<string, Error>();
  function record(operation: (typeof operations)[number]) {
    operations.push(operation);
    const failure = writeFailures.get(operation.model + "." + operation.method);
    if (failure) throw failure;
  }
  let next = 0;
  let transactionFailure: Error | undefined;
  function apply(row: Row, update: Row) {
    Object.assign(row, update.$set ?? {});
    for (const [key, amount] of Object.entries((update.$inc as Row) ?? {}))
      row[key] = Number(row[key] ?? 0) + Number(amount);
  }
  const db = new Proxy(
    {},
    {
      get(_target, name) {
        if (name === "transaction")
          return async (work: (tx: Database) => Promise<unknown>) => {
            record({ model: "Database", method: "transaction" });
            const before = structuredClone(tables);
            try {
              const result = await work(db as Database);
              if (transactionFailure) throw transactionFailure;
              return result;
            } catch (error) {
              for (const key of Object.keys(tables)) {
                const saved = before[key] ?? [];
                const prior = tables[key] ?? [];
                tables[key] = saved.map((row) => {
                  const same = prior.find((item) => (item._id ?? item.id) === (row._id ?? row.id));
                  if (!same) return row;
                  for (const property of Object.keys(same)) delete same[property];
                  Object.assign(same, row);
                  return same;
                });
              }
              throw error;
            }
          };
        const model = String(name);
        tables[model] ??= [];
        return {
          exists: (filter: Row) =>
            query(() =>
              tables[model]!.find((row) => matches(row, filter)) ? { _id: "exists" } : null,
            ),
          find: (filter: Row = {}) =>
            query(() => {
              record({ model, method: "find", filter });
              return tables[model]!.filter((row) => matches(row, filter)).map((row) =>
                structuredClone(row),
              );
            }),
          findById: (id: string) =>
            query(() => {
              record({ model, method: "findById" });
              return structuredClone(
                tables[model]!.find((row) => String(row._id ?? row.id) === String(id)) ?? null,
              );
            }),
          findOne: (filter: Row) =>
            query(() => {
              record({ model, method: "findOne", filter });
              return structuredClone(tables[model]!.find((row) => matches(row, filter)) ?? null);
            }),
          findOneAndUpdate: (filter: Row, update: Row, options?: { upsert?: boolean }) =>
            query(() => {
              record({ model, method: "findOneAndUpdate", filter, update });
              let row = tables[model]!.find((item) => matches(item, filter));
              if (!row && options?.upsert) {
                row = {
                  id: `record-${++next}`,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  ...filter,
                  ...(update.$setOnInsert as Row),
                };
                tables[model]!.push(row);
              }
              if (!row) return null;
              apply(row, update);
              return structuredClone(row);
            }),
          create: async (data: Row) => {
            record({ model, method: "create", update: data });
            const row = {
              id: `record-${++next}`,
              createdAt: new Date(),
              updatedAt: new Date(),
              version: "",
              lastStep: -1,
              attempts: 0,
              googleVerifiedAt: null,
              status: "active",
              description: "",
              isSystem: false,
              ...data,
            };
            tables[model]!.push(row);
            return { ...row, toObject: () => structuredClone(row) };
          },
          insertMany: async (rows: Row[]) => {
            record({ model, method: "insertMany" });
            tables[model]!.push(...rows);
            return rows;
          },
          countDocuments: (filter: Row) =>
            query(() => tables[model]!.filter((row) => matches(row, filter)).length),
          updateOne: (filter: Row, update: Row) =>
            query(() => {
              record({ model, method: "updateOne", filter, update });
              const row = tables[model]!.find((item) => matches(item, filter));
              if (!row) return { modifiedCount: 0, matchedCount: 0 };
              apply(row, update);
              return { modifiedCount: 1, matchedCount: 1 };
            }),
          deleteOne: (filter: Row) =>
            query(() => {
              record({ model, method: "deleteOne", filter });
              const index = tables[model]!.findIndex((row) => matches(row, filter));
              if (index < 0) return { deletedCount: 0 };
              tables[model]!.splice(index, 1);
              return { deletedCount: 1 };
            }),
          deleteMany: (filter: Row) =>
            query(() => {
              record({ model, method: "deleteMany", filter });
              const before = tables[model]!.length;
              tables[model] = tables[model]!.filter((row) => !matches(row, filter));
              return { deletedCount: before - tables[model]!.length };
            }),
        };
      },
    },
  ) as Database;
  return {
    db,
    tables,
    operations,
    failWrite: (model: string, method: string, error: Error) =>
      writeFailures.set(model + "." + method, error),
    failTransaction: (error: Error) => {
      transactionFailure = error;
    },
  };
}
