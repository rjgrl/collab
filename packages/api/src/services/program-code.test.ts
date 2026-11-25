import assert from "node:assert/strict";
import { it } from "node:test";
import type { Context } from "../context";
import { modelFixture } from "../test-utils/model-test-fixture";
import { programsSchemas } from "@Alumni-Tracking-Ss/contracts/academic";
import {
  programCodeFromName,
  programsService,
} from "../../../../apps/server/src/modules/academic/service";

const college = "c00000000000000000000001",
  it_ = "d00000000000000000000001",
  existing = "b00000000000000000000001";

it("derives program codes from names", () => {
  assert.equal(programCodeFromName("Bachelor of Science in Information Technology"), "BSIT");
  assert.equal(
    programCodeFromName("Bachelor of Science in Entertainment and Multimedia Computing"),
    "BSEMC",
  );
  assert.equal(programCodeFromName("Nursing"), "NURSING");
  assert.equal(programCodeFromName("Level 2 Certificate"), "L2C");
  assert.equal(programCodeFromName("!!!"), "PROGRAM");
  assert.ok(programCodeFromName("x ".repeat(60)).length <= 28);
});

it("accepts a missing or blank program code", () => {
  const base = { name: "Nursing", departmentId: it_ };
  assert.equal(programsSchemas.create.input.parse(base).code, undefined);
  assert.equal(programsSchemas.create.input.parse({ ...base, code: "  " }).code, undefined);
  assert.equal(programsSchemas.create.input.parse({ ...base, code: "bsn" }).code, "BSN");
  assert.throws(() => programsSchemas.create.input.parse({ ...base, code: "has space" }));
});

it("generates a unique code when a program is created without one", async () => {
  const f = modelFixture({
    College: [{ _id: college, id: college, name: "Technologies", deletedAt: null }],
    Department: [{ _id: it_, id: it_, name: "IT", collegeId: college, deletedAt: null }],
    Program: [
      {
        _id: existing,
        id: existing,
        name: "Old",
        code: "BSIT",
        departmentId: it_,
        deletedAt: null,
      },
    ],
  });
  const context = {
    db: f.db,
    user: {
      id: "e00000000000000000000001",
      name: "Admin",
      email: "admin@buksu.edu.ph",
      image: null,
      status: "active",
      roles: ["super_admin"],
      permissions: ["programs.write"],
      mfaVerified: true,
    },
    sessionToken: null,
    ipAddress: null,
    userAgent: null,
    integrationEnv: {},
  } as Context;
  const created = await programsService.create(context, {
    name: "Bachelor of Science in Information Technology",
    departmentId: it_,
  });
  assert.equal(created.code, "BSIT-2", "BSIT is taken in this department");
  const renamed = await programsService.update(context, {
    id: existing,
    name: "Renamed",
    departmentId: it_,
    code: "",
  });
  assert.equal(renamed.code, "BSIT", "a blank code on edit keeps the current code");
});
