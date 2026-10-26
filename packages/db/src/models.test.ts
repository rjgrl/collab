import assert from "node:assert/strict";
import { describe, it } from "node:test";
import mongoose, { Types } from "mongoose";
import { readFile } from "node:fs/promises";
import { createModels, schemas } from "./models";
import { toEntity } from "./serialization";

describe("legacy MongoDB model compatibility", () => {
  it("matches every persisted field in the frozen legacy schema without changing scalar or ObjectId storage", async () => {
    const legacy = await readFile(
      new URL("./fixtures/legacy-prisma-schema.prisma", import.meta.url),
      "utf8",
    );
    const scalarTypes: Record<string, string> = {
      String: "String",
      Boolean: "Boolean",
      Int: "Number",
      DateTime: "Date",
      Json: "Mixed",
      UserStatus: "String",
      EmploymentKind: "String",
      StorageProvider: "String",
      ImportSource: "String",
      ImportStatus: "String",
    };
    const models = new Map(Object.entries(schemas));
    for (const match of legacy.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)) {
      const name = match[1]!;
      const schema = models.get(name);
      assert.ok(schema, `Missing legacy model ${name}`);
      for (const row of match[2]!.split("\n")) {
        const field = row.trim().match(/^(\w+)\s+(\w+)(\[\]|\?)?(.*)$/);
        if (!field || !scalarTypes[field[2]!] || (name === "Department" && field[1] === "code")) continue;
        const schemaPath: { instance: string } | undefined =
          schema.paths[field[1] === "id" ? "_id" : field[1]!];
        assert.ok(schemaPath, `Missing legacy field ${name}.${field[1]}`);
        assert.equal(
          schemaPath.instance,
          field[3] === "[]"
            ? "Array"
            : field[4]!.includes("@db.ObjectId")
              ? "ObjectId"
              : scalarTypes[field[2]!],
          `${name}.${field[1]} storage changed`,
        );
      }
    }
  });
  it("retains explicit capitalized collections and never creates collections or indexes automatically", () => {
    for (const [name, schema] of Object.entries(schemas)) {
      assert.equal(schema.get("collection"), name);
      assert.equal(schema.get("autoCreate"), false);
      assert.equal(schema.get("autoIndex"), false);
      assert.equal(schema.get("versionKey"), false);
    }
  });
  it("keeps legacy display names intact and leaves additive names and ownership absent", () => {
    const connection = mongoose.createConnection();
    const db = createModels(connection);
    const user = new db.User({
      _id: new Types.ObjectId(),
      name: "A single unsplit name",
      email: "legacy@example.test",
    });
    const entity = toEntity(user.toObject());
    assert.equal(entity.name, "A single unsplit name");
    for (const field of ["firstName", "middleName", "lastName", "suffix", "alumniId"])
      assert.equal(Object.hasOwn(entity, field), false);
    assert.equal(typeof entity.id, "string");
  });
  it("uses ObjectId foreign keys and an ObjectId-only partial unique alumni link", () => {
    assert.equal(schemas.User.path("alumniId").instance, "ObjectId");
    assert.equal(schemas.Alumni.path("programId").instance, "ObjectId");
    const index = schemas.User.indexes().find(
      ([, options]) => options.name === "User_alumniId_key",
    );
    assert.ok(index);
    assert.equal(index[1].unique, true);
    assert.deepEqual(index[1].partialFilterExpression, { alumniId: { $type: "objectId" } });
    assert.equal(schemas.User.path("alumniId").options.default, undefined);
    assert.equal(schemas.Alumni.path("suffix").options.default, undefined);
    assert.equal(schemas.Alumni.path("deletedAt").options.default, undefined);
  });
});

it("does not declare department codes or uniqueness while retaining required program codes", () => {
  assert.equal(schemas.Department.path("code"), undefined);
  assert.equal(schemas.Department.indexes().some(([, options]) => options.name === "Department_code_key"), false);
  assert.equal(schemas.Program.path("code").options.required, true);
});
