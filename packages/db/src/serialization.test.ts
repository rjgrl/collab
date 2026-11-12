import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Types } from "mongoose";
import { toEntity, type Entity } from "./serialization";

describe("browser-safe entity serialization", () => {
  it("converts root IDs and nested foreign references without losing dates or nulls", () => {
    const id = new Types.ObjectId();
    const role = new Types.ObjectId();
    const date = new Date();
    const result: Entity<{
      _id: Types.ObjectId;
      roleIds: Types.ObjectId[];
      createdAt: Date;
      value: null;
      nested: { _id: Types.ObjectId; __v: number };
    }> = toEntity({
      _id: id,
      roleIds: [role],
      createdAt: date,
      value: null,
      nested: { _id: role, __v: 3 },
    });
    assert.deepEqual(result, {
      id: id.toHexString(),
      roleIds: [role.toHexString()],
      createdAt: date,
      value: null,
      nested: { id: role.toHexString() },
    });
    assert.equal(result.createdAt, date);
  });
  it("preserves optional absence, primitives and arrays without mutating source values", () => {
    const source = {
      _id: new Types.ObjectId(),
      __v: 2,
      entries: [null, "x", 0, false],
      value: undefined,
    };
    const result = toEntity(source);
    assert.ok(!Object.hasOwn(result, "__v"));
    assert.equal(source.__v, 2);
    assert.deepEqual(result.entries, [null, "x", 0, false]);
    assert.equal(Object.hasOwn(result, "suffix"), false);
    assert.equal(Object.hasOwn(result, "value"), true);
  });
});
