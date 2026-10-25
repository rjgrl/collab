import assert from "node:assert/strict";
import { it } from "node:test";
import type { Context } from "../context";
import { alumniService } from "../../../../apps/server/src/modules/alumni/service";
import { usersService } from "../../../../apps/server/src/modules/users/service";
import {
  dashboardService,
  reportsService,
} from "../../../../apps/server/src/modules/reports/service";
import { usersSchemas } from "@Alumni-Tracking-Ss/contracts/users";
function context(db: object) {
  return {
    db,
    user: {
      id: "111111111111111111111111",
      name: "Admin",
      email: "test@example.test",
      image: null,
      status: "active",
      roles: ["super_admin"],
      permissions: ["alumni.read", "users.read", "dashboard.read", "reports.export"],
      mfaVerified: true,
    },
    sessionToken: "synthetic",
    ipAddress: null,
    userAgent: null,
    integrationEnv: {},
  } as unknown as Context;
}
function query<T>(value: T, capture: Record<string, unknown> = {}) {
  return Object.assign(Promise.resolve(value), {
    sort(order: unknown) {
      capture.sort = order;
      return this;
    },
    skip(n: number) {
      capture.skip = n;
      return this;
    },
    limit(n: number) {
      capture.limit = n;
      return this;
    },
    select() {
      return this;
    },
    lean() {
      return this;
    },
    exec: async () => value,
  });
}
const d1 = "222222222222222222222222",
  d2 = "333333333333333333333333",
  p1 = "444444444444444444444444";
it("bounds alumni/member pages and uses stable ordering without changing array responses", async () => {
  const alumni: Record<string, unknown> = {},
    user: Record<string, unknown> = {};
  const db = {
    Department: { find: () => query([]) },
    Program: { find: () => query([]) },
    Alumni: { find: () => query([], alumni) },
    User: { find: () => query([], user) },
  };
  assert.deepEqual(await alumniService.list(context(db), { page: 3, pageSize: 10 }), []);
  assert.equal(alumni.skip, 20);
  assert.equal(alumni.limit, 10);
  assert.ok(JSON.stringify(alumni.sort).includes('"_id"'));
  await usersService.list(context(db), usersSchemas.list.input.parse({}));
  assert.equal(user.limit, 20);
  await assert.rejects(() => alumniService.list(context(db), { pageSize: 101 }));
});
it("uses one grouped count query instead of counts per department", async () => {
  let counts = 0,
    grouped = 0;
  const db = {
    Alumni: {
      countDocuments: async () => {
        counts++;
        return 0;
      },
      aggregate: async () => {
        grouped++;
        return [
          { _id: { programId: p1, isTracked: true }, count: 3, registered: 2 },
          { _id: { programId: p1, isTracked: false }, count: 2 },
        ];
      },
    },
    Department: {
      find: () =>
        query([
          { _id: d1, name: "One", code: "ONE" },
          { _id: d2, name: "Two", code: "TWO" },
        ]),
    },
    Program: { find: () => query([{ _id: p1, departmentId: d1 }]) },
  };
  const result = await dashboardService.summary(context(db));
  assert.equal(counts, 0);
  assert.equal(grouped, 1);
  assert.equal(result.graduates, 5);
  assert.equal(result.tracked, 3);
  assert.equal(result.registered, 2);
  assert.equal(result.byDepartment[0]?.graduates, 5);
  assert.equal(result.byDepartment[0]?.percentTracked, 60);
  assert.equal(result.byDepartment[1]?.graduates, 0);
});
it("rejects oversized exports instead of silently returning partial data", async () => {
  const calls: Record<string, unknown> = {};
  await assert.rejects(
    () =>
      reportsService.alumniCsv(
        context({
          Department: { find: () => query([]) },
          Program: { find: () => query([]) },
          Alumni: {
            find: () =>
              query(
                Array.from({ length: 10001 }, () => ({})),
                calls,
              ),
          },
        }),
      ),
    /exceeds 10,000/,
  );
  assert.equal(calls.limit, 10001);
});
