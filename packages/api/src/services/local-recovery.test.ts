import assert from "node:assert/strict";
import { it } from "node:test";
import type { Database } from "@Alumni-Tracking-Ss/db";
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
  const events: string[] = [];
  const tx = {
    user: { findUnique: async () => user },
    mfaCredential: {
      deleteMany: async () => {
        events.push("credential");
      },
    },
    session: {
      deleteMany: async () => {
        events.push("sessions");
      },
    },
    auditLog: {
      create: async () => {
        events.push("audit");
      },
    },
  };
  const db = {
    ...tx,
    $transaction: async (work: (value: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as Database;
  await assert.rejects(
    () => recoverLocalAdministrator(db, "test@example.test", password, "no"),
    /cancelled/,
  );
  assert.equal(events.length, 0);
  await assert.rejects(
    () => recoverLocalAdministrator(db, "test@example.test", "incorrect", "RESET MY AUTHENTICATOR"),
    /verification failed/,
  );
  assert.equal(events.length, 0);
  user.userRoles = [];
  await assert.rejects(
    () => recoverLocalAdministrator(db, "test@example.test", password, "RESET MY AUTHENTICATOR"),
    /verification failed/,
  );
  assert.equal(events.length, 0);
  user.userRoles = [{ role: { key: "super_admin" } }];
  await recoverLocalAdministrator(db, "test@example.test", password, "RESET MY AUTHENTICATOR");
  assert.deepEqual(events, ["credential", "sessions", "audit"]);
});
