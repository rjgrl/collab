// Operator-only helper; deliberately absent from every HTTP/oRPC router.
import type { Database } from "@Alumni-Tracking-Ss/db";
import { verifyPassword } from "@Alumni-Tracking-Ss/db";
export async function recoverLocalAdministrator(
  db: Database,
  email: string,
  password: string,
  confirmation: string,
) {
  if (confirmation !== "RESET MY AUTHENTICATOR")
    throw new Error("Recovery cancelled. No records changed.");
  const include = { userRoles: { include: { role: true } } } as const;
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() }, include });
  if (
    !user?.passwordHash ||
    user.status !== "active" ||
    !user.userRoles.some(({ role }) => role.key === "super_admin") ||
    !(await verifyPassword(password, user.passwordHash))
  )
    throw new Error("Local administrator verification failed.");
  await db.$transaction(async (tx) => {
    const current = await tx.user.findUnique({ where: { id: user.id }, include });
    if (
      current?.passwordHash !== user.passwordHash ||
      current.status !== "active" ||
      !current.userRoles.some(({ role }) => role.key === "super_admin")
    )
      throw new Error("Account changed. Recovery cancelled.");
    await tx.mfaCredential.deleteMany({ where: { userId: user.id } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "auth.mfa.local_recovery",
        entity: "user",
        entityId: user.id,
        summary:
          "Interactive local operator recovery after password verification; all sessions revoked",
      },
    });
  });
}
