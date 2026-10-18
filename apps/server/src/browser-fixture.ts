// Isolated browser-test server. Never imported by the production entrypoint.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
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
  passwordHash: passwordHash as string | null,
  emailVerified: true,
  phoneVerified: false,
  verificationRequired: false,
  phoneNumber: "",
  gender: "",
  facebookAccount: "",
  needsProfileCompletion: false,
  userRoles: [{ role: adminRole }],
};
type TestSession = {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  googleVerifiedAt?: Date | null;
};
const sessions = new Map<string, TestSession>();
const integrationSettings = new Map<string, boolean>([
  ["recaptcha", false],
  ["google_auth", false],
]);

type Challenge = Awaited<ReturnType<Database["verificationChallenge"]["findUniqueOrThrow"]>>;
const challenges = new Map<string, Challenge>();
let emailCode = "";
function matches(record: object, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR")
      return (condition as Record<string, unknown>[]).some((item) => matches(record, item));
    const value = (record as Record<string, unknown>)[key];
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      return Object.entries(condition).every(([op, expected]) => {
        const actual = value instanceof Date ? value.getTime() : value;
        const test = expected instanceof Date ? expected.getTime() : expected;
        if (op === "gt") return actual != null && Number(actual) > Number(test);
        if (op === "lt") return actual != null && Number(actual) < Number(test);
        if (op === "lte") return actual != null && Number(actual) <= Number(test);
        if (op === "not") return value !== expected;
        if (op === "isSet") return (value !== undefined) === expected;
        return false;
      });
    }
    return value instanceof Date && condition instanceof Date
      ? value.getTime() === condition.getTime()
      : value === condition;
  });
}
function apply(record: object, data: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) {
    const target = record as Record<string, unknown>;
    target[key] =
      value && typeof value === "object" && "increment" in value
        ? Number(target[key]) + Number(value.increment)
        : value;
  }
}
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (String(input) === "https://mail.example.test") {
    const body = JSON.parse(String(init?.body)) as { text: string };
    emailCode = body.text.match(/\b[0-9]{6}\b/)?.[0] ?? "";
    return Response.json({ ok: true });
  }
  return nativeFetch(input, init);
};

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
  verificationChallenge: {
    findUnique: async ({ where }: { where: { userId_kind: { userId: string; kind: string } } }) =>
      challenges.get(where.userId_kind.kind) ?? null,
    upsert: async ({
      create,
    }: {
      create: Omit<Challenge, "id" | "updatedAt" | "attempts" | "codeHash" | "providerSid">;
    }) => {
      if (!challenges.has(create.kind))
        challenges.set(create.kind, {
          ...create,
          id: create.kind,
          updatedAt: new Date(),
          attempts: 0,
          codeHash: null,
          providerSid: null,
        });
      return structuredClone(challenges.get(create.kind)!);
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const row = challenges.get(String(where.id));
      if (!row || !matches(row, where)) return { count: 0 };
      apply(row, data);
      return { count: 1 };
    },
  },
  user: {
    findUniqueOrThrow: async () => user,
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      if (!matches(user, where)) return { count: 0 };
      apply(user, data);
      return { count: 1 };
    },
    findUnique: async () => user,
    findMany: async () => [user],
    update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(user, data),
  },
  userRole: { count: async () => 1 },
  session: {
    findUnique: async ({ where }: { where: { token: string } }) =>
      sessions.get(where.token) ?? null,
    create: async ({ data }: { data: { token: string; userId: string; expiresAt: Date } }) => {
      const session = { ...data, id: data.token };
      sessions.set(data.token, session);
      return session;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      let count = 0;
      for (const row of sessions.values())
        if (matches(row, where)) {
          apply(row, data);
          count++;
        }
      return { count };
    },
    deleteMany: async ({ where }: { where?: Record<string, unknown> } = {}) => {
      for (const [token, row] of sessions)
        if (!where || matches(row, where)) sessions.delete(token);
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
    const beforeUser = { ...user };
    const beforeSessions = structuredClone(sessions);
    const beforeChallenges = structuredClone(challenges);
    try {
      const result = await work(transaction);
      if (failNext) {
        failNext = false;
        throw new Error("Synthetic database failure");
      }
      return result;
    } catch (error) {
      Object.assign(role, before);
      Object.assign(user, beforeUser);
      sessions.clear();
      for (const [key, row] of beforeSessions) sessions.set(key, row);
      challenges.clear();
      for (const [key, row] of beforeChallenges) challenges.set(key, row);
      throw error;
    }
  },
} as unknown as Database;
const verificationEnv = {
  googleClientId: "synthetic-browser-client",
  googleClientSecret: "synthetic-browser-secret",
  appUrl: "http://127.0.0.1:3100",
  smtpUrl: "https://mail.example.test",
  verificationSecret: "synthetic-test-only-verification-key-1234567890",
  smsProvider: undefined as
    | {
        sendCode: (phone: string) => Promise<string>;
        checkCode: (sid: string, phone: string, code: string) => Promise<boolean>;
      }
    | undefined,
};
const createTestApplication = () =>
  createApp({
    db,
    config: { nodeEnv: "test", origin: "http://127.0.0.1:3101" },
    integrationEnv: verificationEnv,
  });
let testApplication = createTestApplication();
const app = new Hono();
app.post("/__test/reset", (c) => {
  Object.assign(user, {
    passwordHash,
    needsProfileCompletion: false,
    verificationRequired: false,
    phoneVerified: false,
    emailVerified: true,
    phoneNumber: "",
    gender: "",
    facebookAccount: "",
  });
  challenges.clear();
  sessions.clear();
  emailCode = "";
  verificationEnv.smsProvider = undefined;
  createdRoles.length = 0;
  role.rolePermissions = [];
  role.updatedAt = new Date(initialDate);
  failNext = false;
  integrationSettings.clear();
  integrationSettings.set("recaptcha", false);
  integrationSettings.set("google_auth", false);
  testApplication = createTestApplication();
  return c.json({ ok: true });
});
app.post("/__test/google", (c) => {
  integrationSettings.set("google_auth", true);
  return c.json({ ok: true });
});
app.post("/__test/incomplete", (c) => {
  user.needsProfileCompletion = true;
  return c.json({ ok: true });
});
app.get("/__test/code", (c) => c.json({ emailCode }));
app.post("/__test/unverified", (c) => {
  Object.assign(user, {
    verificationRequired: true,
    emailVerified: false,
    phoneVerified: false,
    phoneNumber: "+639171234567",
    gender: "Female",
  });
  return c.json({ ok: true });
});
app.post("/__test/password-required", (c) => {
  Object.assign(user, {
    passwordHash: null,
    verificationRequired: true,
    emailVerified: true,
    phoneVerified: true,
    phoneNumber: "+639171234567",
    gender: "Female",
  });
  for (const session of sessions.values()) session.googleVerifiedAt = new Date();
  return c.json({ ok: true });
});
app.post("/__test/stale-google", (c) => {
  for (const session of sessions.values())
    session.googleVerifiedAt = new Date(Date.now() - 600_000);
  return c.json({ ok: true });
});
app.post("/__test/connect-sms", (c) => {
  verificationEnv.smsProvider = {
    sendCode: async () => "synthetic-sms",
    checkCode: async (sid, phone, code) =>
      sid === "synthetic-sms" && phone === user.phoneNumber && code === "654321",
  };
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
app.all("*", (c) => testApplication.fetch(c.req.raw));
serve({ fetch: app.fetch, port: 3100, hostname: "127.0.0.1" });
