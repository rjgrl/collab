import type { Database } from "./index";
import { schemas } from "./models";
import { referencePaths } from "./reference-integrity";

export type BrokenReference = {
  /** For example "Alumni.programId -> Program". */
  reference: string;
  count: number;
  /** Up to `sampleLimit` _id values of the referring documents; never their contents. */
  sample: string[];
};

/**
 * Scans every `ref` field for values that point at no document. Read-only; one aggregation per
 * reference, each a $lookup on the target's _id index.
 */
export async function findBrokenReferences(
  db: Database,
  sampleLimit = 5,
): Promise<BrokenReference[]> {
  await db.ready();
  const native = db.connection.db;
  if (!native) throw new Error("Database connection is not ready");
  const existing = new Set(
    (await native.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name),
  );
  const collectionOf = (model: string) =>
    String((schemas as Record<string, { get(key: string): unknown }>)[model]!.get("collection"));
  const broken: BrokenReference[] = [];
  for (const [model, schema] of Object.entries(schemas)) {
    const source = collectionOf(model);
    if (!existing.has(source)) continue;
    for (const { path, target } of referencePaths(schema)) {
      const [row] = await native
        .collection(source)
        .aggregate<{ count: number; sample: unknown[] }>(
          [
            { $match: { [path]: { $exists: true, $ne: null } } },
            {
              $lookup: {
                from: collectionOf(target),
                localField: path,
                foreignField: "_id",
                as: "__target",
              },
            },
            { $match: { "__target.0": { $exists: false } } },
            { $group: { _id: null, count: { $sum: 1 }, sample: { $push: "$_id" } } },
            { $project: { _id: 0, count: 1, sample: { $slice: ["$sample", sampleLimit] } } },
          ],
          { allowDiskUse: true },
        )
        .toArray();
      if (row?.count)
        broken.push({
          reference: `${model}.${path} -> ${target}`,
          count: row.count,
          sample: row.sample.map(String),
        });
    }
  }
  return broken;
}
