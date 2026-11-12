import { createDatabase, verifyPassword } from "../packages/db/src/index";
import { verifyTransactionSupport } from "../packages/db/src/transactions";
import { isManagedLocalDatabase } from "./local-env.mjs";
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !isManagedLocalDatabase(url) || process.env.NODE_ENV === "production")
    throw new Error("Local verification requires a managed development database.");
  const db = createDatabase({ DATABASE_URL: url });
  try {
    const user = await db.User.findOne({ email: process.env.SEED_ADMIN_EMAIL }).lean();
    const role = await db.Role.findOne({ key: "super_admin" }).lean();
    if (
      !user?.passwordHash ||
      user.status !== "active" ||
      !role ||
      !(await db.UserRole.exists({ userId: user._id, roleId: role._id }))
    )
      throw new Error(
        "The configured bootstrap account is not an active administrator. No account was elevated or reset. Correct private bootstrap configuration.",
      );
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password) throw new Error("Configure the private bootstrap password for verification.");
    const initialPasswordMatches = await verifyPassword(password, user.passwordHash);
    if (!initialPasswordMatches)
      console.warn(
        "Existing administrator password differs from the initial login note; setup did not reset it. Use the current password.",
      );
    await verifyTransactionSupport(db);
    console.log(
      "Verified active administrator and real MongoDB nested transaction rollback; existing password preserved.",
    );
  } finally {
    await db.disconnect();
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Local setup verification failed.");
  process.exitCode = 1;
});
