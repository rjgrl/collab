import assert from "node:assert/strict";
import { it } from "node:test";
import { call } from "@orpc/server";
import type { Context } from "../context";
import { alumniRouter } from "../routers/alumni";
import { usersRouter } from "../routers/rbac";
import { dashboardRouter, reportsRouter } from "../routers/dashboard";
function context(db: object) {
  return {
    db,
    user: {
      id: "u",
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
it("bounds alumni/member pages and uses stable ordering without changing array responses", async () => {
  const calls: Record<string, unknown>[] = [];
  const db = {
    alumni: {
      findMany: async (args: Record<string, unknown>) => {
        calls.push(args);
        return [];
      },
    },
    user: {
      findMany: async (args: Record<string, unknown>) => {
        calls.push(args);
        return [];
      },
    },
  };
  assert.deepEqual(
    await call(alumniRouter.list, { page: 3, pageSize: 10 }, { context: context(db) }),
    [],
  );
  assert.equal(calls[0]?.skip, 20);
  assert.equal(calls[0]?.take, 10);
  assert.ok(JSON.stringify(calls[0]?.orderBy).includes('"id"'));
  await call(usersRouter.list, undefined, { context: context(db) });
  assert.equal(calls[1]?.take, 20);
  await assert.rejects(() => call(alumniRouter.list, { pageSize: 101 }, { context: context(db) }));
});
it("uses one grouped count query instead of counts per department", async () => {
  let counts = 0,
    grouped = 0;
  const result = await call(dashboardRouter.summary, undefined, {
    context: context({
      alumni: {
        count: async () => {
          counts++;
          return counts === 1 ? 5 : 3;
        },
        groupBy: async () => {
          grouped++;
          return [
            { programId: "p1", isTracked: true, _count: { _all: 3 } },
            { programId: "p1", isTracked: false, _count: { _all: 2 } },
          ];
        },
      },
      department: {
        findMany: async () => [
          { id: "d1", name: "One", code: "ONE", programs: [{ id: "p1" }] },
          { id: "d2", name: "Two", code: "TWO", programs: [] },
        ],
      },
    }),
  });
  assert.equal(counts, 2);
  assert.equal(grouped, 1);
  assert.equal(result.byDepartment[0]?.graduates, 5);
  assert.equal(result.byDepartment[0]?.percentTracked, 60);
  assert.equal(result.byDepartment[1]?.graduates, 0);
});
it("rejects oversized exports instead of silently returning partial data", async () => {
  let take = 0;
  await assert.rejects(
    () =>
      call(reportsRouter.alumniCsv, undefined, {
        context: context({
          alumni: {
            findMany: async (args: { take: number }) => {
              take = args.take;
              return Array.from({ length: 10001 }, () => ({}));
            },
          },
        }),
      }),
    /exceeds 10,000/,
  );
  assert.equal(take, 10001);
});
