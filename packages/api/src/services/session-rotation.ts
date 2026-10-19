import { createHash } from "node:crypto";
import { createSessionToken } from "@Alumni-Tracking-Ss/db";
import type { Prisma } from "@Alumni-Tracking-Ss/db";
import { ORPCError } from "@orpc/server";
import type { Context } from "../context";
export async function rotateSession(
  tx: Prisma.TransactionClient,
  context: Context,
  proof?: { version: string; verifiedAt: Date },
  revokeOthers = false,
) {
  const prior = await tx.session.findUnique({
    where: { token: context.sessionStorageToken ?? context.sessionToken ?? "" },
  });
  if (!prior || prior.userId !== context.user!.id || prior.expiresAt <= new Date())
    throw new ORPCError("UNAUTHORIZED");
  const token = createSessionToken();
  const storage = "sha256:" + createHash("sha256").update(token).digest("hex");
  await tx.session.create({
    data: {
      token: storage,
      userId: prior.userId,
      expiresAt: prior.expiresAt,
      lastSeenAt: new Date(),
      mfaVersion: proof?.version ?? prior.mfaVersion,
      mfaVerifiedAt: proof?.verifiedAt ?? prior.mfaVerifiedAt,
      ipAddress: prior.ipAddress,
      userAgent: prior.userAgent,
    },
  });
  await tx.session.deleteMany({
    where: revokeOthers ? { userId: prior.userId, token: { not: storage } } : { id: prior.id },
  });
  return { token, expiresAt: prior.expiresAt };
}
