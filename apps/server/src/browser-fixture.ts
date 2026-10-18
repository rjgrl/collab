// Isolated browser-test server. Never imported by the production entrypoint.
import { serve } from "@hono/node-server";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { hashPassword, PERMISSIONS } from "@Alumni-Tracking-Ss/db";
import { createApp } from "./app";

if (process.env.NODE_ENV !== "test") throw new Error("Browser fixtures require NODE_ENV=test.");
const permissions = PERMISSIONS.map((item, i) => ({ ...item, id: String(i + 1) }));
const initialDate = "2026-01-01T00:00:00.000Z";
const role = {
  id: "staff",
  key: "staff",
  name: "Test Staff",
  description: "Synthetic role",
  isSystem: false,
  updatedAt: new Date(initialDate),
  rolePermissions: [] as { permissionId: string; permission: (typeof permissions)[number] }[],
  _count: { userRoles: 0 },
};
const adminRole = {
  ...role,
  id: "admin",
  key: "super_admin",
  name: "Test Admin",
  isSystem: true,
  rolePermissions: permissions.map((permission) => ({ permissionId: permission.id, permission })),
  _count: { userRoles: 1 },
};
const passwordHash = await hashPassword("BrowserTest123!");
const user = {
  id: "test-user",
  name: "Test Administrator",
  email: "admin@example.test",
  image: null,
  status: "active",
  passwordHash,
  userRoles: [{ role: adminRole }],
};
const sessions = new Map<string, { id: string; token: string; userId: string; expiresAt: Date }>();
const integrationSettings = new Map<string, boolean>([
  ["recaptcha", false],
  ["google_auth", false],
]);
const createdRoles: (typeof role)[] = [];
let failNext = false;
const transaction = {
  alumni: { count: async () => 0, findMany: async () => [] },
  program: { findMany: async () => [] },
  department: { findMany: async () => [] },
  role: {
    findMany: async () => [adminRole, role, ...createdRoles],
    create: async ({
      data,
    }: {
      data: {
        key: string;
        name: string;
        description?: string;
        rolePermissions: { create: { permissionId: string }[] };
      };
    }) => {
      const created = {
        ...role,
        id: `role-${createdRoles.length}`,
        key: data.key,
        name: data.name,
        description: data.description ?? "",
        updatedAt: new Date(),
        rolePermissions: data.rolePermissions.create.map(({ permissionId }) => ({
          permissionId,
          permission: permissions.find((item) => item.id === permissionId)!,
        })),
      };
      createdRoles.push(created);
      return created;
    },
    findUnique: async () => role,
    findUniqueOrThrow: async () => role,
    updateMany: async ({
      where,
      data,
    }: {
      where: { updatedAt: Date };
      data: { updatedAt: Date };
    }) => {
      if (role.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
      role.updatedAt = data.updatedAt;
      return { count: 1 };
    },
  },
  permission: {
    findMany: async (args?: { where?: { id: { in: string[] } } }) =>
      args?.where ? permissions.filter((p) => args.where!.id.in.includes(p.id)) : permissions,
  },
  rolePermission: {
    deleteMany: async () => {
      role.rolePermissions = [];
    },
    createMany: async ({ data }: { data: { permissionId: string }[] }) => {
      role.rolePermissions = data.map((row) => ({
        permissionId: row.permissionId,
        permission: permissions.find((p) => p.id === row.permissionId)!,
      }));
    },
  },
  user: { findUnique: async () => user, findMany: async () => [user] },
  userRole: { count: async () => 1 },
  session: {
    findUnique: async ({ where }: { where: { token: string } }) =>
      sessions.get(where.token) ?? null,
    create: async ({ data }: { data: { token: string; userId: string; expiresAt: Date } }) => {
      const session = { ...data, id: data.token };
      sessions.set(data.token, session);
      return session;
    },
    deleteMany: async () => {
      sessions.clear();
    },
  },
  auditLog: { create: async () => ({ id: "audit" }) },
  integrationSetting: {
    findUnique: async ({ where }: { where: { key: string } }) => ({
      enabled: integrationSettings.get(where.key) ?? true,
    }),
    findMany: async () => [...integrationSettings].map(([key, enabled]) => ({ key, enabled })),
    upsert: async ({ where, update }: { where: { key: string }; update: { enabled: boolean } }) => {
      integrationSettings.set(where.key, update.enabled);
      return { id: where.key, key: where.key, ...update };
    },
  },
};
const db = {
  ...transaction,
  $runCommandRaw: async () => ({ ok: 1 }),
  $transaction: async (work: (tx: typeof transaction) => Promise<unknown>) => {
    const before = { ...role, rolePermissions: [...role.rolePermissions] };
    try {
      const result = await work(transaction);
      if (failNext) {
        failNext = false;
        throw new Error("Synthetic database failure");
      }
      return result;
    } catch (error) {
      Object.assign(role, before);
      throw error;
    }
  },
} as unknown as Database;
const app = createApp({
  db,
  config: { nodeEnv: "test", origin: "http://127.0.0.1:3101" },
  integrationEnv: {},
});
app.post("/__test/reset", (c) => {
  createdRoles.length = 0;
  role.rolePermissions = [];
  role.updatedAt = new Date(initialDate);
  failNext = false;
  integrationSettings.clear();
  integrationSettings.set("recaptcha", false);
  integrationSettings.set("google_auth", false);
  return c.json({ ok: true });
});
app.post("/__test/fail", (c) => {
  failNext = true;
  return c.json({ ok: true });
});
app.post("/__test/concurrent", (c) => {
  role.updatedAt = new Date(Date.now() + 60_000);
  return c.json({ ok: true });
});
serve({ fetch: app.fetch, port: 3100, hostname: "127.0.0.1" });
