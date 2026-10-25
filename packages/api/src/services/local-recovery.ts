import { toEntity } from "@Alumni-Tracking-Ss/db";
// Operator-only helper; deliberately absent from every HTTP/oRPC router.
import type { Database } from "@Alumni-Tracking-Ss/db";
import { loadUserRoles } from "./authorization";
import { verifyPassword } from "@Alumni-Tracking-Ss/db";
import { writeAudit } from "../audit";
export async function recoverLocalAdministrator(
  db: Database,
  email: string,
  password: string,
  confirmation: string,
) {
  if (confirmation !== "RESET MY AUTHENTICATOR")
    throw new Error("Recovery cancelled. No records changed.");
  const user = await db.User.findOne({ email: email.trim().toLowerCase() })
    .lean()
    .exec()
    .then((row) => (row ? toEntity(row) : null));
  if (
    !user?.passwordHash ||
    user.status !== "active" ||
    !(await loadUserRoles(db, user.id)).some((role) => role.key === "super_admin") ||
    !(await verifyPassword(password, user.passwordHash))
  )
    throw new Error("Local administrator verification failed.");
  await db.transaction(async (tx) => {
    const current = await tx.User.findOne({ _id: user.id })
      .lean()
      .exec()
      .then((row) => (row ? toEntity(row) : null));
    if (
      !current ||
      current.passwordHash !== user.passwordHash ||
      current.status !== "active" ||
      !(await loadUserRoles(tx, user.id)).some((role) => role.key === "super_admin")
    )
      throw new Error("Account changed. Recovery cancelled.");
    await tx.MfaCredential.deleteMany({ userId: user.id }).exec();
    await tx.Session.deleteMany({ userId: user.id }).exec();
    await writeAudit(tx, {
      actor: user,
      action: "auth.mfa.local_recovery",
      entity: "user",
      entityId: user.id,
      summary:
        "Interactive local operator recovery after password verification; all sessions revoked",
    });
  });
}
