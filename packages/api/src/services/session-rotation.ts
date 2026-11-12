import { createHash } from "node:crypto";
import { createSessionToken, toEntity, type Database } from "@Alumni-Tracking-Ss/db";
import { ApiError } from "../http-error";
import type { Context } from "../context";
export async function rotateSession(
  tx: Database,
  context: Context,
  proof?: { version: string; verifiedAt: Date },
  revokeOthers = false,
) {
  const row = await tx.Session.findOne({
    token: context.sessionStorageToken ?? context.sessionToken ?? "",
  })
    .lean()
    .exec();
  const prior = row ? toEntity(row) : null;
  if (!prior || prior.userId !== context.user?.id || prior.expiresAt <= new Date())
    throw new ApiError("UNAUTHORIZED");
  const token = createSessionToken();
  const storage = "sha256:" + createHash("sha256").update(token).digest("hex");
  await tx.Session.create({
    token: storage,
    userId: prior.userId,
    expiresAt: prior.expiresAt,
    lastSeenAt: new Date(),
    mfaVersion: proof?.version ?? prior.mfaVersion,
    mfaVerifiedAt: proof?.verifiedAt ?? prior.mfaVerifiedAt,
    ipAddress: prior.ipAddress,
    userAgent: prior.userAgent,
  });
  await tx.Session.deleteMany(
    revokeOthers ? { userId: prior.userId, token: { $ne: storage } } : { _id: prior.id },
  ).exec();
  return { token, expiresAt: prior.expiresAt };
}
