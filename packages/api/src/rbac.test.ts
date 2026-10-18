import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ORPCError, call } from "@orpc/server";

import type { AuthUser, Context } from "./context";
import { PERMISSION_KEYS, ROLE_PRESETS } from "@Alumni-Tracking-Ss/db";

import { alumniRouter } from "./routers/alumni";
import { usersRouter, rolesRouter, authRouter, permissionsRouter } from "./routers/rbac";
import { dashboardRouter, auditRouter, filesRouter, reportsRouter } from "./routers/dashboard";

const ROOT = join(import.meta.dirname, "..");

type AnyProcedure = Parameters<typeof call>[0];

/**
 * oRPC's generic `Context` is invariant in its internal symbol, so a router's
 * decorated procedure is not structurally assignable to `Parameters<typeof call>[0]`.
 * The cast is confined to this one helper.
 */
function invoke(procedure: unknown, input: unknown, context: Context) {
  return call(procedure as AnyProcedure, input as never, { context } as never);
}

/**
 * A database stub that fails loudly on any access. Authorization denials must
 * short-circuit before a handler reads or writes anything, so a denial test that
 * touches this stub at all is a bug.
 */
function forbiddenDb() {
  return new Proxy(
    {},
    {
      get(_target, model) {
        throw new Error(`handler reached the database (model: ${String(model)}) despite a denial`);
      },
    },
  ) as Context["db"];
}

/** A database stub that records calls and returns canned results. */
function stubDb(rows: Record<string, unknown> = {}) {
  const reads: { model: string; method: string; args: unknown }[] = [];
  const db = new Proxy({} as Record<string, unknown>, {
    get(_target, modelName) {
      if (modelName === "$transaction")
        return async (work: (tx: Context["db"]) => Promise<unknown>) =>
          work(db as unknown as Context["db"]);
      const model = String(modelName);
      return new Proxy(
        {},
        {
          get(_inner, methodName) {
            const method = String(methodName);
            return async (args?: unknown) => {
              reads.push({ model, method, args });
              return rows[model] ?? [];
            };
          },
        },
      );
    },
  });
  return { db: db as unknown as Context["db"], reads };
}

function makeUser(permissions: string[], overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-1",
    name: "Test User",
    email: "test@alumni.local",
    image: null,
    status: "active",
    roles: ["test"],
    permissions: permissions as AuthUser["permissions"],
    ...overrides,
  };
}

function makeContext(user: AuthUser | null, db: Context["db"] = forbiddenDb()): Context {
  return {
    db,
    sessionToken: "token",
    user,
    ipAddress: "127.0.0.1",
    userAgent: "test",
    integrationEnv: {},
  };
}

async function expectCode(
  code: "UNAUTHORIZED" | "FORBIDDEN" | "BAD_REQUEST",
  procedure: unknown,
  user: AuthUser | null,
  input?: unknown,
  db: Context["db"] = forbiddenDb(),
) {
  await assert.rejects(
    () => invoke(procedure, input, makeContext(user, db)),
    (error: unknown) => {
      assert.ok(error instanceof ORPCError, `expected ORPCError, got ${String(error)}`);
      assert.equal(error.code, code);
      return true;
    },
  );
}

const expectDenied = (procedure: unknown, user: AuthUser | null, input?: unknown) =>
  expectCode("FORBIDDEN", procedure, user, input);

const NEW_ALUMNI = {
  gender: "Female",
  programId: "p1",
  studentNumber: "2020-0001",
  firstName: "Juan",
  lastName: "Dela Cruz",
};

describe("RBAC: authentication gate", () => {
  it("rejects anonymous callers as UNAUTHORIZED, not FORBIDDEN", async () => {
    await expectCode("UNAUTHORIZED", alumniRouter.list, null);
    await expectCode("UNAUTHORIZED", alumniRouter.create, null, NEW_ALUMNI);
    await expectCode("UNAUTHORIZED", alumniRouter.addTracking, null, {
      alumniId: "a1",
      isTracked: true,
    });
    await expectCode("UNAUTHORIZED", rolesRouter.list, null);
  });

  it("rejects disabled accounts even when they hold the permission", async () => {
    await expectDenied(alumniRouter.list, makeUser(["alumni.read"], { status: "disabled" }));
  });

  it("keeps auth.me public and returns null for anonymous callers", async () => {
    assert.equal(await invoke(authRouter.me, undefined, makeContext(null)), null);
  });
});

describe("RBAC: alumni permission granularity", () => {
  it("keeps evidence metadata empty without file-read permission", async () => {
    const { db } = stubDb({ alumni: { id: "a1", evidenceFiles: [{ id: "private" }] } });
    const result = await invoke(
      alumniRouter.get,
      { id: "a1" },
      makeContext(makeUser(["alumni.read"]), db),
    );
    assert.deepEqual((result as { evidenceFiles: unknown[] }).evidenceFiles, []);
  });
  it("a read-only viewer can list and read but cannot mutate", async () => {
    const { db, reads } = stubDb({ alumni: [] });
    const viewer = makeUser([...ROLE_PRESETS.viewer.permissions]);

    await invoke(alumniRouter.list, {}, makeContext(viewer, db));
    await invoke(alumniRouter.get, { id: "a1" }, makeContext(viewer, db));

    await expectDenied(alumniRouter.create, viewer, NEW_ALUMNI);
    await expectDenied(alumniRouter.update, viewer, { ...NEW_ALUMNI, id: "a1" });
    await expectDenied(alumniRouter.delete, viewer, { id: "a1" });
    await expectDenied(alumniRouter.addTracking, viewer, { alumniId: "a1", isTracked: true });
    assert.equal(reads.length, 2, "only the two allowed reads should reach the database");
  });

  it("separates alumni.write from alumni.delete", async () => {
    const editor = makeUser(["alumni.read", "alumni.write"]);
    const { db } = stubDb({ alumni: {}, auditLog: {} });

    await invoke(alumniRouter.update, { ...NEW_ALUMNI, id: "a1" }, makeContext(editor, db));
    await expectDenied(alumniRouter.delete, editor, { id: "a1" });
  });

  it("separates tracking.write from alumni.write", async () => {
    const editor = makeUser(["alumni.read", "alumni.write"]);
    await expectDenied(alumniRouter.addTracking, editor, { alumniId: "a1", isTracked: true });

    const tracker = makeUser(["alumni.read", "tracking.write"]);
    const { db } = stubDb({ trackingEvent: {}, alumni: {}, auditLog: {} });
    await invoke(
      alumniRouter.addTracking,
      { alumniId: "a1", isTracked: true },
      makeContext(tracker, db),
    );
  });

  it("a user holding only the alumni module cannot reach other modules", async () => {
    const alumniOnly = makeUser(["alumni.read", "alumni.write", "alumni.delete", "tracking.write"]);
    await expectDenied(usersRouter.list, alumniOnly);
    await expectDenied(usersRouter.create, alumniOnly, {
      name: "X",
      email: "x@y.z",
      password: "password123",
    });
    await expectDenied(rolesRouter.list, alumniOnly);
    await expectDenied(rolesRouter.update, alumniOnly, { id: "r1", permissionIds: [] });
    await expectDenied(dashboardRouter.summary, alumniOnly);
    await expectDenied(reportsRouter.alumniCsv, alumniOnly, { tracked: "all" });
    await expectDenied(auditRouter.list, alumniOnly);
    await expectDenied(filesRouter.remove, alumniOnly, { id: "f1" });
  });

  it("an rbac administrator without alumni rights cannot read alumni", async () => {
    const rbacAdmin = makeUser([
      "users.read",
      "users.write",
      "roles.read",
      "roles.write",
      "roles.delete",
      "permissions.read",
    ]);
    await expectDenied(alumniRouter.list, rbacAdmin);
    await expectDenied(alumniRouter.create, rbacAdmin, NEW_ALUMNI);
  });
});

describe("RBAC: coverage of the permission catalog", () => {
  function collectRequiredPermissions(): Map<string, string[]> {
    const found = new Map<string, string[]>();
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) {
          continue;
        }
        const source = readFileSync(full, "utf8");
        for (const match of source.matchAll(/requirePermission\("([^"]+)"\)/g)) {
          const key = match[1];
          if (!key) {
            continue;
          }
          found.set(key, [...(found.get(key) ?? []), entry]);
        }
      }
    };
    walk(join(ROOT, "src"));
    return found;
  }

  it("no procedure requires a permission outside the catalog", () => {
    const known = new Set<string>(PERMISSION_KEYS);
    const unknown = [...collectRequiredPermissions().keys()].filter((key) => !known.has(key));
    assert.deepEqual(unknown, []);
  });

  it("every permission key actually grants something", () => {
    const enforced = collectRequiredPermissions();
    // files.read / files.write are enforced in apps/server raw HTTP routes
    // (multipart upload and binary download), not in oRPC procedures.
    const enforcedElsewhere = new Set(["files.read", "files.write"]);
    const dead = PERMISSION_KEYS.filter((key) => !enforced.has(key) && !enforcedElsewhere.has(key));
    assert.deepEqual(dead, [], `permissions that grant no access anywhere: ${dead.join(", ")}`);
  });
});

describe("RBAC: role presets", () => {
  it("staff can manage alumni but not RBAC or the audit log", () => {
    const { permissions } = ROLE_PRESETS.staff;
    for (const key of ["alumni.read", "alumni.write", "alumni.delete", "tracking.write"]) {
      assert.ok((permissions as readonly string[]).includes(key), `staff must hold ${key}`);
    }
    for (const key of permissions) {
      assert.ok(
        !key.startsWith("users.") && !key.startsWith("roles."),
        `staff must not hold ${key}`,
      );
    }
    assert.equal((permissions as readonly string[]).includes("audit.read"), false);
    assert.equal((permissions as readonly string[]).includes("permissions.read"), false);
  });

  it("viewer is strictly read-only", () => {
    for (const key of ROLE_PRESETS.viewer.permissions) {
      assert.ok(key.endsWith(".read"), `viewer must not hold ${key}`);
    }
  });

  it("super_admin holds the entire catalog", () => {
    assert.equal(ROLE_PRESETS.super_admin.permissions.length, PERMISSION_KEYS.length);
  });
});

describe("RBAC: effective permission resolution", () => {
  type Role = { key: string; rolePermissions: { permission: { key: string } }[] };

  function userDb(roles: Role[]) {
    return {
      user: {
        findUnique: async () => ({
          id: "u1",
          name: "n",
          email: "e",
          image: null,
          status: "active",
          userRoles: roles.map((role) => ({ role })),
        }),
      },
    } as unknown as Context["db"];
  }

  it("unions permissions across multiple roles and de-duplicates", async () => {
    const { loadAuthUser } = await import("./services/session");
    const db = userDb([
      {
        key: "viewer",
        rolePermissions: [
          { permission: { key: "alumni.read" } },
          { permission: { key: "dashboard.read" } },
        ],
      },
      {
        key: "staff",
        rolePermissions: [
          { permission: { key: "alumni.read" } },
          { permission: { key: "alumni.write" } },
        ],
      },
    ]);

    const user = await loadAuthUser(db, "u1");
    assert.deepEqual([...(user?.permissions ?? [])].sort(), [
      "alumni.read",
      "alumni.write",
      "dashboard.read",
    ]);
    assert.deepEqual(user?.roles.sort(), ["staff", "viewer"]);
  });

  it("revoking a role permission removes access on the next resolution", async () => {
    const { loadAuthUser } = await import("./services/session");
    const before = userDb([
      { key: "staff", rolePermissions: [{ permission: { key: "alumni.write" } }] },
    ]);
    const after = userDb([{ key: "staff", rolePermissions: [] }]);

    assert.ok((await loadAuthUser(before, "u1"))?.permissions.includes("alumni.write"));
    assert.deepEqual((await loadAuthUser(after, "u1"))?.permissions, []);
  });

  it("ignores retired faculty grants from existing databases", async () => {
    const { loadAuthUser } = await import("./services/session");
    const db = userDb([
      {
        key: "legacy",
        rolePermissions: [
          { permission: { key: "faculties.read" } },
          { permission: { key: "alumni.read" } },
        ],
      },
    ]);
    assert.deepEqual((await loadAuthUser(db, "u1"))?.permissions, ["alumni.read"]);
  });

  it("a user with no roles resolves to an empty permission set", async () => {
    const { loadAuthUser } = await import("./services/session");
    const user = await loadAuthUser(userDb([]), "u1");
    assert.deepEqual(user?.permissions, []);
    assert.deepEqual(user?.roles, []);
  });
});

describe("RBAC: hasPermission helper", () => {
  it("matches the middleware rule", async () => {
    const { hasPermission } = await import("./audit");
    assert.equal(hasPermission(["alumni.read"], "alumni.read"), true);
    assert.equal(hasPermission([], "alumni.read"), false);
    assert.equal(hasPermission(["alumni.write"], "alumni.read"), false);
  });
});

describe("RBAC: protected administration", () => {
  const superAdmin = () =>
    makeUser([...PERMISSION_KEYS], { id: "admin-1", roles: ["super_admin"] });
  const role = {
    id: "r1",
    key: "super_admin",
    name: "Super Admin",
    isSystem: true,
    rolePermissions: [],
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  const target = { id: "admin-1", email: "admin@example.test", userRoles: [{ role }] };
  it("rejects changing the protected administrator permission set", async () => {
    const { db, reads } = stubDb({ role });
    await expectCode(
      "FORBIDDEN",
      rolesRouter.update,
      superAdmin(),
      { id: "r1", permissionIds: [], expectedUpdatedAt: role.updatedAt.toISOString() },
      db,
    );
    assert.equal(
      reads.some((r) => r.method === "deleteMany"),
      false,
    );
  });
  it("rejects removal of administrator role assignments", async () => {
    const { db, reads } = stubDb({ user: target });
    await expectCode(
      "FORBIDDEN",
      usersRouter.update,
      superAdmin(),
      { id: target.id, roleIds: [] },
      db,
    );
    assert.equal(
      reads.some((r) => r.method === "deleteMany"),
      false,
    );
  });
  it("rejects disabling protected administrator accounts", async () => {
    const { db } = stubDb({ user: target });
    await expectCode(
      "FORBIDDEN",
      usersRouter.setStatus,
      superAdmin(),
      { id: target.id, status: "disabled" },
      db,
    );
  });
  it("separates account status from account editing", async () => {
    await expectDenied(usersRouter.setStatus, makeUser(["users.write"]), {
      id: "u1",
      status: "disabled",
    });
  });
  it("rejects deletion of system roles", async () => {
    const { db } = stubDb({ role });
    await expectCode("BAD_REQUEST", rolesRouter.delete, superAdmin(), { id: "r1" }, db);
  });
});

it("hides retired faculty permissions and routes without deleting legacy records", async () => {
  const { appRouter } = await import("./routers/index");
  assert.equal("faculties" in appRouter, false);
  const legacy = { id: "old", key: "faculties.read" };
  const active = { id: "current", key: "alumni.read" };
  const { db } = stubDb({
    permission: [legacy, active],
    role: [{ id: "r1", rolePermissions: [{ permission: legacy }, { permission: active }] }],
  });
  const context = makeContext(makeUser(["permissions.read", "roles.read"]), db);
  assert.deepEqual(await invoke(permissionsRouter.list, undefined, context), [active]);
  const roles = (await invoke(rolesRouter.list, undefined, context)) as {
    rolePermissions: { permission: { key: string } }[];
  }[];
  assert.deepEqual(roles[0]?.rolePermissions, [{ permission: active }]);
});
