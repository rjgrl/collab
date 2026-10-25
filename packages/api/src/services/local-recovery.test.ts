import assert from "node:assert/strict";
import { it } from "node:test";
import { modelFixture } from "./model-test-fixture";
import { hashPassword } from "@Alumni-Tracking-Ss/db";
import { recoverLocalAdministrator } from "./local-recovery";
it("local operator recovery requires explicit confirmation, administrator status and the current password", async () => {
  const password = "A private local recovery passphrase 6789";
  const user = {
    id: "u",
    passwordHash: await hashPassword(password),
    status: "active",
    userRoles: [{ role: { key: "super_admin" } }],
  };
  const f = modelFixture({
    User: [{ ...user, email: "test@example.test" }],
    UserRole: [{ userId: "u", roleId: "r" }],
    Role: [{ id: "r", key: "super_admin" }],
  });
  const db = f.db;
  const events = () =>
    f.operations.flatMap((op) =>
      op.model === "MfaCredential" && op.method === "deleteMany"
        ? ["credential"]
        : op.model === "Session" && op.method === "deleteMany"
          ? ["sessions"]
          : op.model === "AuditLog" && op.method === "create"
            ? ["audit"]
            : [],
    );
  await assert.rejects(
    () => recoverLocalAdministrator(db, "test@example.test", password, "no"),
    /cancelled/,
  );
  assert.equal(events().length, 0);
  await assert.rejects(
    () => recoverLocalAdministrator(db, "test@example.test", "incorrect", "RESET MY AUTHENTICATOR"),
    /verification failed/,
  );
  assert.equal(events().length, 0);
  f.tables.UserRole = [];
  await assert.rejects(
    () => recoverLocalAdministrator(db, "test@example.test", password, "RESET MY AUTHENTICATOR"),
    /verification failed/,
  );
  assert.equal(events().length, 0);
  f.tables.UserRole = [{ userId: "u", roleId: "r" }];
  await recoverLocalAdministrator(db, "test@example.test", password, "RESET MY AUTHENTICATOR");
  assert.deepEqual(events(), ["credential", "sessions", "audit"]);
});
