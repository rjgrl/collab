import type { Connection, Model, Query, Schema } from "mongoose";

/**
 * MongoDB has no foreign keys. This plugin gives every `ref` field one at write time: creating a
 * document, inserting many, or updating a reference field fails when the referenced document
 * does not exist. Because transactions use Mongoose's async-local session, the existence check
 * runs inside the caller's transaction and sees its uncommitted writes.
 *
 * Deletes are not covered here (a parent can still be removed under its children); the nightly
 * integrity check (findBrokenReferences) reports anything that slips through, including writes
 * made with the native driver by migrations or mongorestore.
 */
export class MissingReferenceError extends Error {
  constructor(
    readonly model: string,
    readonly field: string,
    readonly target: string,
  ) {
    super(`${model}.${field} refers to a ${target} that does not exist.`);
    this.name = "MissingReferenceError";
  }
}

export type ReferencePath = { path: string; target: string };

export function referencePaths(schema: Schema): ReferencePath[] {
  const found: ReferencePath[] = [];
  schema.eachPath((path, type) => {
    const options = type.options as { ref?: unknown; integrity?: boolean };
    // `integrity: false` marks historical references (audit actors) that may outlive their target.
    if (typeof options.ref === "string" && options.integrity !== false)
      found.push({ path, target: options.ref });
  });
  return found;
}

async function assertExists(
  connection: Connection,
  model: string,
  field: string,
  target: string,
  value: unknown,
) {
  if (value === null || value === undefined) return;
  const exists = await connection.model(target).exists({ _id: value });
  if (!exists) throw new MissingReferenceError(model, field, target);
}

/** Reference values an update sets, from $set, $setOnInsert or a replacement document. */
function updatedReferences(update: Record<string, unknown> | null, paths: ReferencePath[]) {
  if (!update) return [];
  const sources = [
    update.$set,
    update.$setOnInsert,
    Object.fromEntries(Object.entries(update).filter(([key]) => !key.startsWith("$"))),
  ].filter((source): source is Record<string, unknown> => Boolean(source));
  return paths.flatMap(({ path, target }) =>
    sources
      .filter((source) => path in source)
      .map((source) => ({ path, target, value: source[path] })),
  );
}

export function referenceIntegrity(schema: Schema) {
  const paths = referencePaths(schema);
  if (!paths.length) return;
  // On save (create and document saves), not validate: schema validation must stay usable
  // without a database connection.
  schema.pre("save", async function () {
    const model = this.constructor as Model<unknown>;
    for (const { path, target } of paths)
      if (this.isNew || this.isModified(path))
        await assertExists(model.db, model.modelName, path, target, this.get(path));
  });
  schema.pre("insertMany", async function (this: Model<unknown>, docs: unknown) {
    const rows = (Array.isArray(docs) ? docs : [docs]) as Record<string, unknown>[];
    for (const { path, target } of paths)
      for (const value of new Set(rows.map((row) => row?.[path]).filter((value) => value != null)))
        await assertExists(this.db, this.modelName, path, target, value);
  });
  schema.pre(
    ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace"],
    async function (this: Query<unknown, unknown>) {
      const update = this.getUpdate() as Record<string, unknown> | null;
      for (const { path, target, value } of updatedReferences(update, paths))
        await assertExists(this.model.db, this.model.modelName, path, target, value);
    },
  );
}
