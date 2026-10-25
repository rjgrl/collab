import assert from "node:assert/strict";
import { it } from "node:test";
import { PERMISSION_KEYS } from "@Alumni-Tracking-Ss/db";
import { departmentInputSchema, programInputSchema } from "@Alumni-Tracking-Ss/contracts/academic";
import type { Context } from "../context";
import * as audit from "../audit";
import { departmentsService } from "../../../../apps/server/src/modules/academic/service";
import { auditService } from "../../../../apps/server/src/modules/audit/service";
import { modelFixture } from "./model-test-fixture";

const actorId = "111111111111111111111111";
function fixture() {
  const f = modelFixture({
    User: [{ id: actorId, name: "Original Actor", email: "original@example.test" }],
  });
  const context = {
    db: f.db,
    user: {
      id: actorId,
      name: "Original Actor",
      email: "original@example.test",
      image: null,
      status: "active",
      roles: ["super_admin"],
      permissions: [...PERMISSION_KEYS],
      mfaVerified: true,
    },
    sessionToken: null,
    ipAddress: null,
    userAgent: null,
    integrationEnv: {},
  } as Context;
  return { ...f, context };
}

it("creates departments without codes and keeps program codes required", async () => {
  const f = fixture();
  assert.equal(departmentInputSchema.safeParse({ name: "Science", code: "" }).success, false);
  const first = await departmentsService.create(f.context, { name: "Science" });
  const second = await departmentsService.create(f.context, { name: "Arts" });
  assert.equal(Object.hasOwn(first, "code"), false);
  assert.equal(Object.hasOwn(second, "code"), false);
  assert.equal(programInputSchema.safeParse({ name: "Degree", departmentId: actorId }).success, false);
  assert.equal(programInputSchema.safeParse({ name: "Degree", departmentId: actorId, code: "" }).success, false);
});

it("preserves historical stored department codes when editing names", async () => {
  const f = fixture();
  f.tables.Department = [{ id: actorId, name: "Science", code: "SCI", deletedAt: null }];
  const updated = await departmentsService.update(f.context, { id: actorId, name: "New Science" });
  assert.equal(updated.name, "New Science");
  assert.equal(f.tables.Department[0]?.code, "SCI");
});

it("records the actual department changes and actor at event time despite later edits", async () => {
  const f = fixture();
  await departmentsService.create(f.context, {
    name: "Science",
    description: "Old description",
  });
  f.tables.Department![0]!.id = actorId;
  await departmentsService.update(f.context, {
    id: actorId,
    name: "Natural Sciences",
    description: "New description",
  });
  const event = f.tables.AuditLog!.find((row) => row.action === "departments.update")!;
  assert.match(String(event.summary), /Science.*Natural Sciences/);
  assert.match(String(event.summary), /Old description.*New description/);
  Object.assign(f.tables.Department![0]!, { name: "Later department name" });
  Object.assign(f.tables.User![0]!, { name: "Later Actor", email: "later@example.test" });
  const result = await auditService.list(f.context);
  const saved = result.find((row) => row.action === "departments.update")!;
  assert.equal(saved.actor?.email, "original@example.test");
  assert.equal(saved.actorIsSnapshot, true);
  assert.equal(saved.summary, event.summary);
  assert.equal(String(saved.summary).includes("Later department name"), false);
});

it("keeps a department change atomic with its audit entry", async () => {
  const f = fixture();
  await departmentsService.create(f.context, { name: "Science" });
  f.tables.Department![0]!.id = actorId;
  f.failWrite("AuditLog", "create", new Error("Synthetic audit failure"));
  await assert.rejects(
    () => departmentsService.update(f.context, { id: actorId, name: "Changed" }),
    /Synthetic audit failure/,
  );
  assert.equal(f.tables.Department![0]?.name, "Science");
});

it("describes only actual allowlisted changes and excludes credentials and tokens", () => {
  const summary = audit.describeAuditChanges(
    { name: "Before", enabled: false, passwordHash: "old-secret" },
    {
      name: "After",
      enabled: true,
      passwordHash: "new-secret",
      password: "private",
      token: "sensitive",
      codeHash: "secret-code",
    },
  );
  assert.match(summary, /Before.*After/);
  assert.match(summary, /false.*true/);
  assert.doesNotMatch(summary, /secret|private|sensitive|password|token|codeHash/);
  assert.equal(
    audit.describeAuditChanges({ name: "Same" }, { name: "Same" }),
    "No audited fields changed.",
  );
});

it("does not relabel missing legacy actors as System or invent missing historical summaries", async () => {
  const f = fixture();
  f.tables.AuditLog = [
    {
      id: actorId,
      actorId,
      action: "legacy.update",
      entity: "department",
      summary: "Original legacy summary",
      createdAt: new Date(),
    },
  ];
  const legacy = (await auditService.list(f.context))[0]!;
  assert.equal(legacy.actorIsSnapshot, false);
  assert.equal(legacy.summary, "Original legacy summary");
  assert.equal(legacy.actor?.email, "original@example.test");
  f.tables.User = [];
  const missingActor = (await auditService.list(f.context))[0]!;
  assert.equal(missingActor.actor, null);
  assert.equal(missingActor.actorId, actorId);
});

it("captures only public actor identity when writing a structured audit event", async () => {
  const f = fixture();
  const actor = { ...f.context.user!, passwordHash: "never-record-this" };
  await audit.writeAudit(f.db, {
    actor,
    action: "test",
    entity: "user",
    entityId: actorId,
    summary: "Test event",
  });
  const serialized = JSON.stringify(f.tables.AuditLog);
  assert.match(serialized, /original@example.test/);
  assert.doesNotMatch(serialized, /never-record-this|passwordHash|permissions|mfaVerified/);
});
