import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Database } from "./index";

export const TIMESTAMP_EDIT_LIFETIME_MS = 30 * 60 * 1000;
const CLOCK_KEY = "alumni-core";
export type TimestampState = { readTimestamp: number; writeTimestamp: number };
export type TransactionTimestamp = { timestamp: number; epoch: string; startedAt: Date };
type ConflictReason = "read" | "write" | "unavailable" | "scope" | "reset";

export class TimestampConflictError extends Error {
  readonly code: "TIMESTAMP_CONFLICT" | "TIMESTAMP_UNAVAILABLE";
  readonly status: 409 | 503;
  constructor(readonly reason: ConflictReason) {
    super(
      reason === "reset"
        ? "Timestamp coordination is unavailable. Contact your system administrator."
        : reason === "read" || reason === "write"
          ? "A newer transaction has priority for this alumnus. Your changes were not saved. Reload latest and review before trying again."
          : "This edit is expired, already used or unavailable. Your changes were not saved. Reload latest before trying again.",
    );
    this.name = "TimestampConflictError";
    this.code = reason === "reset" ? "TIMESTAMP_UNAVAILABLE" : "TIMESTAMP_CONFLICT";
    this.status = reason === "reset" ? 503 : 409;
  }
}

function validTimestamp(timestamp: number) {
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0)
    throw new RangeError("A transaction timestamp must be a positive safe integer.");
}
export function timestampRead(state: TimestampState, timestamp: number): TimestampState {
  validTimestamp(timestamp);
  if (timestamp < state.writeTimestamp) throw new TimestampConflictError("read");
  return { ...state, readTimestamp: Math.max(state.readTimestamp, timestamp) };
}
export function timestampWrite(state: TimestampState, timestamp: number): TimestampState {
  validTimestamp(timestamp);
  if (timestamp < state.readTimestamp || timestamp < state.writeTimestamp)
    throw new TimestampConflictError("write");
  return { ...state, writeTimestamp: timestamp };
}
function resourceKeys(alumniIds: readonly string[]) {
  if (!alumniIds.length || alumniIds.some((id) => !/^[a-f\d]{24}$/i.test(id)))
    throw new RangeError("Valid alumni identifiers are required.");
  return [...new Set(alumniIds.map((id) => id.toLowerCase()))].sort();
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function timestampOwnerKey(userId: string, sessionIdentity: string) {
  return digest(`${userId}\0${sessionIdentity}`);
}

export async function reserveTransactionTimestamp(db: Database): Promise<TransactionTimestamp> {
  const clock = await db.TimestampClock.findOneAndUpdate(
    { key: CLOCK_KEY },
    {
      $inc: { value: 1 },
      $setOnInsert: { epoch: randomUUID() },
      $currentDate: { allocatedAt: true },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: false },
  )
    .session(null)
    .lean()
    .orFail();
  validTimestamp(clock.value);
  return { timestamp: clock.value, epoch: clock.epoch, startedAt: clock.allocatedAt };
}

async function stateFor(db: Database, stamp: TransactionTimestamp, key: string) {
  const state = await db.AlumniTimestamp.findOneAndUpdate(
    { key },
    { $setOnInsert: { epoch: stamp.epoch, readTimestamp: 0, writeTimestamp: 0 } },
    { upsert: true, returnDocument: "after" },
  )
    .lean()
    .orFail();
  if (state.epoch !== stamp.epoch) throw new TimestampConflictError("reset");
  return state;
}

/** Low-level protocol operation; call within the same database transaction as its protected read. */
export async function readAlumniTimestamps(
  db: Database,
  stamp: TransactionTimestamp,
  alumniIds: readonly string[],
) {
  for (const key of resourceKeys(alumniIds)) {
    const state = await stateFor(db, stamp, key);
    const next = timestampRead(state, stamp.timestamp);
    const claim = await db.AlumniTimestamp.updateOne(
      { key, epoch: stamp.epoch, writeTimestamp: { $lte: stamp.timestamp } },
      { $max: { readTimestamp: next.readTimestamp } },
    );
    if (claim.matchedCount !== 1) throw new TimestampConflictError("read");
  }
}

/** Low-level protocol operation; the state claim, business writes and audit must commit together. */
export async function writeAlumniTimestamps(
  db: Database,
  stamp: TransactionTimestamp,
  alumniIds: readonly string[],
) {
  for (const key of resourceKeys(alumniIds)) {
    const state = await stateFor(db, stamp, key);
    timestampWrite(state, stamp.timestamp);
    const claim = await db.AlumniTimestamp.updateOne(
      {
        key,
        epoch: stamp.epoch,
        readTimestamp: { $lte: stamp.timestamp },
        writeTimestamp: { $lte: stamp.timestamp },
      },
      { $set: { writeTimestamp: stamp.timestamp } },
    );
    if (claim.matchedCount !== 1) throw new TimestampConflictError("write");
  }
}

export async function beginTimestampEdit<T>(
  db: Database,
  options: { ownerKey: string; alumniIds: readonly string[] },
  authorizedRead: (tx: Database) => Promise<T>,
) {
  const resources = resourceKeys(options.alumniIds);
  const stamp = await reserveTransactionTimestamp(db);
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(stamp.startedAt.getTime() + TIMESTAMP_EDIT_LIFETIME_MS);
  return db.transaction(async (tx) => {
    const snapshot = await authorizedRead(tx);
    await readAlumniTimestamps(tx, stamp, resources);
    await tx.TimestampEdit.create({
      tokenHash: digest(token),
      ownerKey: options.ownerKey,
      resources,
      ...stamp,
      expiresAt,
    });
    return { token, timestamp: stamp.timestamp, expiresAt, snapshot };
  });
}

export async function commitTimestampEdit<T, R>(
  db: Database,
  options: { ownerKey: string; token: string; alumniIds: readonly string[] },
  authorize: (tx: Database) => Promise<T>,
  mutate: (tx: Database, current: T, stamp: TransactionTimestamp) => Promise<R>,
): Promise<R> {
  const resources = resourceKeys(options.alumniIds);
  return db.transaction(async (tx) => {
    const current = await authorize(tx);
    if (!/^[a-f\d]{64}$/.test(options.token)) throw new TimestampConflictError("unavailable");
    const filter = {
      tokenHash: digest(options.token),
      ownerKey: options.ownerKey,
      consumedAt: null,
      $expr: { $gt: ["$expiresAt", "$$NOW"] },
    };
    const edit = await tx.TimestampEdit.findOne(filter).lean();
    if (!edit) throw new TimestampConflictError("unavailable");
    if (resources.some((id) => !edit.resources.includes(id)))
      throw new TimestampConflictError("scope");
    const clock = await tx.TimestampClock.findOne({ key: CLOCK_KEY, epoch: edit.epoch }).lean();
    if (!clock || clock.value < edit.timestamp) throw new TimestampConflictError("reset");
    const claimed = await tx.TimestampEdit.updateOne(filter, {
      $currentDate: { consumedAt: true },
    });
    if (claimed.matchedCount !== 1) throw new TimestampConflictError("unavailable");
    const stamp = { timestamp: edit.timestamp, epoch: edit.epoch, startedAt: edit.startedAt };
    await writeAlumniTimestamps(tx, stamp, resources);
    return mutate(tx, current, stamp);
  });
}

export async function runTimestampOperation<T, R>(
  db: Database,
  alumniIds: readonly string[],
  authorizedRead: (tx: Database) => Promise<T>,
  mutate: (tx: Database, current: T, stamp: TransactionTimestamp) => Promise<R>,
): Promise<R> {
  const stamp = await reserveTransactionTimestamp(db);
  return db.transaction(async (tx) => {
    const current = await authorizedRead(tx);
    await readAlumniTimestamps(tx, stamp, alumniIds);
    await writeAlumniTimestamps(tx, stamp, alumniIds);
    return mutate(tx, current, stamp);
  });
}
