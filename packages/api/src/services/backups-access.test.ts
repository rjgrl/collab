import assert from "node:assert/strict";
import { it } from "node:test";
import type { Context } from "../context";
import { modelFixture } from "../test-utils/model-test-fixture";
import { backupsService } from "../../../../apps/server/src/modules/backups/service";

function context(roles: string[], mfaVerified: boolean) {
  const f = modelFixture({ BackupState: [], MfaCredential: [] });
  return {
    f,
    context: {
      db: f.db,
      user: {
        id: "u00000000000000000000001",
        name: "Synthetic Admin",
        email: "admin@example.test",
        image: null,
        status: "active",
        roles,
        permissions: ["users.read", "users.write"],
        mfaVerified,
        mfaEnrolled: true,
      },
      sessionToken: null,
      ipAddress: null,
      userAgent: null,
      integrationEnv: {},
    } as Context,
  };
}
const restoreInput = {
  id: "20261109000000-0a1b2c3d",
  confirmation: "RESTORE",
  code: "123456",
} as const;

it("denies every backup action to non-administrators and to unverified MFA sessions", async () => {
  for (const [roles, verified] of [
    [["faculty"], true],
    [["viewer"], true],
    [["super_admin"], false],
  ] as const) {
    const { f, context: ctx } = context([...roles], verified);
    for (const action of [
      () => backupsService.overview(ctx, undefined),
      () => backupsService.create(ctx, undefined),
      () =>
        backupsService.schedule(ctx, {
          frequency: "daily",
          time: "02:00",
          weekday: 0,
          retention: 7,
        }),
      () => backupsService.restore(ctx, undefined, restoreInput),
      () => backupsService.restoreStatus(ctx),
    ])
      await assert.rejects(action, { code: "FORBIDDEN" }, `${roles.join()} verified=${verified}`);
    assert.deepEqual(f.tables.BackupState, [], "nothing was written");
  }
});

it("reports missing configuration and refuses to back up without it", async () => {
  const { context: ctx } = context(["super_admin"], true);
  const overview = await backupsService.overview(ctx, undefined);
  assert.deepEqual(overview.configured, { encryptionKey: false, dir: false, tools: false });
  assert.equal(overview.schedule.frequency, "off");
  assert.equal(overview.restore.status, "idle");
  await assert.rejects(() => backupsService.create(ctx, undefined), {
    code: "SERVICE_UNAVAILABLE",
  });
});

it("requires the literal RESTORE confirmation and a 6-digit code before anything else", async () => {
  const { f, context: ctx } = context(["super_admin"], true);
  await assert.rejects(() =>
    backupsService.restore(ctx, undefined, {
      ...restoreInput,
      confirmation: "restore" as "RESTORE",
    }),
  );
  await assert.rejects(() =>
    backupsService.restore(ctx, undefined, { ...restoreInput, code: "12" }),
  );
  // A well-formed request without an enrolled authenticator is refused by the step-up check.
  await assert.rejects(() => backupsService.restore(ctx, undefined, restoreInput), {
    code: "FORBIDDEN",
  });
  assert.deepEqual(f.tables.BackupState, []);
});
