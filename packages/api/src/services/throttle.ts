import { createHash } from "node:crypto";
import { ApiError } from "../http-error";
import type { Database } from "@Alumni-Tracking-Ss/db";

export function boundedSetting(value: string | undefined, fallback: number, max: number) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max)
    throw new Error("Invalid authentication rate-limit configuration.");
  return parsed;
}

// Atomic MongoDB counters shared by all application instances and HTTP transports.
// Fixed windows can permit a boundary burst; the independent IP limit remains.
export async function consumeAuthAttempt(
  db: Database,
  scope: string,
  identity: string,
  limit = 5,
  windowMs = 15 * 60_000,
  now = Date.now(),
) {
  const window = Math.floor(now / windowMs);
  const key = `${scope}:${createHash("sha256").update(identity.trim().toLowerCase()).digest("hex")}:${window}`;
  const expiresAt = new Date((window + 1) * windowMs);
  const claim = () =>
    db.AuthThrottle.findOneAndUpdate(
      { key },
      { $inc: { count: 1 }, $setOnInsert: { key, expiresAt } },
      { upsert: true, returnDocument: "after" },
    )
      .lean()
      .exec();
  let bucket;
  try {
    bucket = await claim();
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 11000)
      bucket = await claim();
    else throw error;
  }
  if (!bucket || bucket.count > limit)
    throw new ApiError("TOO_MANY_REQUESTS", {
      message: "Too many attempts. Please wait before trying again.",
      data: { retryAfterSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)) },
    });
  return { key };
}
