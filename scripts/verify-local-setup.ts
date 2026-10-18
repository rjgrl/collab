import { randomUUID } from "node:crypto";
import { createPrismaClient, verifyPassword } from "../packages/db/src/index";
import { isManagedLocalDatabase } from "./local-env.mjs";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !isManagedLocalDatabase(url) || process.env.NODE_ENV === "production")
    throw new Error("Local setup verification requires a managed development database.");
  const db = createPrismaClient({ DATABASE_URL: url });
  try {
    const user = await db.user.findUnique({
      where: { email: process.env.SEED_ADMIN_EMAIL! },
      include: { userRoles: { include: { role: true } } },
    });
    if (
      !user?.passwordHash ||
      user.status !== "active" ||
      !user.userRoles.some(({ role }) => role.key === "super_admin")
    )
      throw new Error(
        "The configured bootstrap account is not an active administrator. No account was elevated or reset. Correct the private bootstrap configuration.",
      );
    const initialPasswordMatches = await verifyPassword(
      process.env.SEED_ADMIN_PASSWORD!,
      user.passwordHash,
    );
    if (!initialPasswordMatches)
      console.warn(
        "The existing administrator's password has changed. Use its current password; setup did not reset it. The initial-login file may be out of date.",
      );
    const probe = "local-setup-" + randomUUID();
    try {
      await db.$transaction(async (tx) => {
        await tx.auditLog.create({ data: { action: "local.setup.probe", entity: probe } });
        throw new Error(probe);
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== probe) throw error;
    }
    if (await db.auditLog.count({ where: { entity: probe } }))
      throw new Error("Local transaction rollback verification failed.");
    console.log(
      initialPasswordMatches
        ? "Verified administrator login and real MongoDB transaction rollback."
        : "Verified active administrator and real MongoDB transaction rollback; existing password preserved.",
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Local setup verification failed.");
  process.exitCode = 1;
});
