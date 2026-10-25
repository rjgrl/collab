/** Browser-safe: no runtime dependency on Mongoose, MongoDB or Node. */
export type Entity<T> = T extends Date
  ? Date
  : T extends { toHexString(): string }
    ? string
    : T extends readonly (infer Item)[]
      ? Entity<Item>[]
      : T extends object
        ? { [K in keyof T as K extends "__v" ? never : K extends "_id" ? "id" : K]: Entity<T[K]> }
        : T;

function convert(value: unknown): unknown {
  if (value === null || typeof value !== "object" || value instanceof Date) return value;
  if ("toHexString" in value && typeof value.toHexString === "function") {
    const id: unknown = value.toHexString();
    if (typeof id === "string" && /^[0-9a-f]{24}$/i.test(id)) return id;
  }
  if ("toObject" in value && typeof value.toObject === "function") return convert(value.toObject());
  if (Array.isArray(value)) return value.map(convert);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "__v")
      .map(([key, item]) => [key === "_id" ? "id" : key, convert(item)]),
  );
}

export function toEntity<T>(value: { toObject(): T }): Entity<T>;
export function toEntity<T>(value: T): Entity<T>;
export function toEntity(value: unknown): unknown {
  return convert(value);
}
