import assert from "node:assert/strict";
import { it } from "node:test";
import type { Context } from "../context";
import { modelFixture } from "../test-utils/model-test-fixture";
import {
  collegesService,
  departmentsService,
  programsService,
} from "../../../../apps/server/src/modules/academic/service";

// One college with two departments (IT, Auto) and a second college (Education).
const college = "c00000000000000000000001",
  otherCollege = "c00000000000000000000002";
const it_ = "d00000000000000000000001",
  auto = "d00000000000000000000002",
  edu = "d00000000000000000000003";
const bsit = "b00000000000000000000001",
  bsat = "b00000000000000000000002",
  bsed = "b00000000000000000000003";
const head = "f00000000000000000000009",
  headUser = "e00000000000000000000009";

function context(roleLevel: "faculty" | "department" | "college", placed = true) {
  const { db } = modelFixture({
    College: [
      { _id: college, id: college, name: "Technologies", deletedAt: null },
      { _id: otherCollege, id: otherCollege, name: "Education", deletedAt: null },
    ],
    Department: [
      { _id: it_, id: it_, name: "IT", collegeId: college, deletedAt: null },
      { _id: auto, id: auto, name: "Auto", collegeId: college, deletedAt: null },
      { _id: edu, id: edu, name: "Edu", collegeId: otherCollege, deletedAt: null },
    ],
    Program: [
      { _id: bsit, id: bsit, name: "BSIT", code: "BSIT", departmentId: it_, deletedAt: null },
      { _id: bsat, id: bsat, name: "BSAT", code: "BSAT", departmentId: auto, deletedAt: null },
      { _id: bsed, id: bsed, name: "BSEd", code: "BSED", departmentId: edu, deletedAt: null },
    ],
    Alumni: [],
    Faculty: [
      {
        _id: head,
        id: head,
        userId: headUser,
        departmentId: it_,
        roleLevel,
        active: placed,
        deletedAt: null,
      },
    ],
  });
  return {
    db,
    user: {
      id: headUser,
      name: "Head",
      email: "head@buksu.edu.ph",
      image: null,
      status: "active",
      roles: ["faculty"],
      permissions: ["departments.read", "programs.read"],
      mfaVerified: true,
    },
    sessionToken: null,
    ipAddress: null,
    userAgent: null,
    integrationEnv: {},
  } as Context;
}
const ids = (rows: { id: string }[]) => rows.map((row) => row.id).sort();

it("Department Heads read only their own department, its college and its programs", async () => {
  const c = context("department");
  assert.deepEqual(ids(await collegesService.list(c)), [college]);
  assert.deepEqual(ids(await departmentsService.list(c)), [it_]);
  assert.deepEqual(ids(await programsService.list(c)), [bsit]);
  assert.deepEqual(ids(await programsService.list(c, { departmentId: auto })), []);
  await assert.rejects(() => departmentsService.get(c, { id: auto }), /Department not found/);
  await assert.rejects(() => programsService.get(c, { id: bsat }), /Active program not found/);
  assert.equal((await departmentsService.get(c, { id: it_ })).id, it_);
});

it("College Deans read every department and program of their college only", async () => {
  const c = context("college");
  assert.deepEqual(ids(await collegesService.list(c)), [college]);
  assert.deepEqual(ids(await departmentsService.list(c)), [it_, auto].sort());
  assert.deepEqual(ids(await programsService.list(c)), [bsit, bsat].sort());
  await assert.rejects(() => departmentsService.get(c, { id: edu }), /Department not found/);
  assert.equal((await programsService.get(c, { id: bsat })).id, bsat);
});

it("Faculty read only their own department, and unplaced accounts read nothing", async () => {
  const c = context("faculty");
  assert.deepEqual(ids(await collegesService.list(c)), [college]);
  assert.deepEqual(ids(await departmentsService.list(c)), [it_]);
  assert.deepEqual(ids(await programsService.list(c)), [bsit]);
  const none = context("faculty", false);
  assert.deepEqual(await collegesService.list(none), []);
  assert.deepEqual(await departmentsService.list(none), []);
  assert.deepEqual(await programsService.list(none), []);
  await assert.rejects(() => departmentsService.get(none, { id: it_ }), /Department not found/);
});
