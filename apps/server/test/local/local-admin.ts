// Test-only helper for the *-local.ts integration scripts. Never imported by the server.
import type { Database } from "@Alumni-Tracking-Ss/db";
import { createSession } from "@Alumni-Tracking-Ss/api/services/session";

/**
 * A session cookie for the seeded bootstrap administrator with MFA already satisfied, so
 * scripts can exercise administrator-only routes (academic structure, unscoped alumni access)
 * the way the retired Staff role used to.
 */
export async function adminCookie(db: Database, email = process.env.SEED_ADMIN_EMAIL!) {
  const admin = await db.User.findOne({ email }).orFail().lean();
  const version = "local-script";
  await db.MfaCredential.updateOne(
    { userId: admin._id },
    {
      $set: { version, secretCipher: "local-script-only" },
      $setOnInsert: { userId: admin._id, lastStep: -1, recoveryHashes: [] },
    },
    { upsert: true },
  );
  const { token, storageToken } = await createSession(db, String(admin._id), {});
  await db.Session.updateOne(
    { token: storageToken },
    { $set: { mfaVersion: version, mfaVerifiedAt: new Date() } },
  );
  return `ats_session=${token}`;
}
