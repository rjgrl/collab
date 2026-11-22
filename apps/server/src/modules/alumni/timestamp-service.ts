import { z } from "zod";
import { toEntity, type Database } from "@Alumni-Tracking-Ss/db";
import {
  beginTimestampEdit,
  commitTimestampEdit,
  runTimestampOperation,
  timestampOwnerKey,
  TimestampConflictError,
  type TransactionTimestamp,
} from "@Alumni-Tracking-Ss/db/timestamp-ordering";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { requireAccess, requireAdministrator } from "@Alumni-Tracking-Ss/api/access";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { alumniScopeFilter, assignmentScope } from "@Alumni-Tracking-Ss/api/scope";
import {
  assertSuperAdmin,
  assertRoleScope,
  isSuperAdminKind,
  loadUserRoles,
} from "@Alumni-Tracking-Ss/api/services/authorization";
import { objectIdSchema } from "@Alumni-Tracking-Ss/contracts/common";
import { timestampEditSchemas } from "@Alumni-Tracking-Ss/contracts/timestamp";
import { management } from "../academic/service";
import { linkedAlumni } from "./access";

type Kind =
  | "details"
  | "assignment"
  | "employment"
  | "self-employment"
  | "tracking"
  | "archive"
  | "restore"
  | "account"
  | "member";
const idsSchema = z.array(objectIdSchema).min(1).max(500);
function canonical(ids: readonly string[]) {
  return [...new Set(ids.map((id) => id.toLowerCase()))].sort();
}
function ownerKey(context: Context) {
  const actor = requireAccess(context);
  return timestampOwnerKey(
    actor.id,
    context.sessionStorageToken ?? context.sessionToken ?? "internal-context",
  );
}

async function resources(context: Context, tx: Database, kind: Kind, input: unknown) {
  const fields = z.record(z.string(), z.unknown()).parse(input);
  if (kind === "account" || kind === "member") {
    const actor = requireAccess(context);
    if (kind === "member") {
      requireAccess(context, "users.write");
      if (
        !["firstName", "middleName", "lastName", "suffix"].some((key) => fields[key] !== undefined)
      )
        return [];
    }
    const userId = kind === "account" ? actor.id : objectIdSchema.parse(fields.id);
    const row = await tx.User.findById(userId).select("alumniId").lean();
    if (!row) throw new ApiError("NOT_FOUND", { message: "User not found." });
    return row.alumniId ? [String(row.alumniId)] : [];
  }
  if (kind === "assignment") return canonical(idsSchema.parse(fields.alumniIds));
  if (kind === "employment" || kind === "self-employment") {
    if (fields.id !== undefined) {
      const job = await tx.Employment.findById(objectIdSchema.parse(fields.id))
        .select("alumniId")
        .lean();
      if (!job) throw new ApiError("NOT_FOUND");
      return [String(job.alumniId)];
    }
    return kind === "self-employment"
      ? [(await linkedAlumni(context, tx)).id]
      : [objectIdSchema.parse(fields.alumniId)];
  }
  return [objectIdSchema.parse(kind === "tracking" ? fields.alumniId : fields.id)];
}

async function authorizeResources(
  context: Context,
  tx: Database,
  kind: Kind,
  alumniIds: readonly string[],
  allowOwnEmployment = false,
) {
  const actor = requireAccess(context);
  if (kind === "account" || kind === "member") {
    const user = await tx.User.findOne({ alumniId: alumniIds[0] }).lean();
    if (!user) throw new ApiError("NOT_FOUND", { message: "Account link not found." });
    if (String(user._id) !== actor.id) {
      requireAccess(context, "users.write");
      const roles = await loadUserRoles(tx, String(user._id));
      if (roles.some(isSuperAdminKind)) assertSuperAdmin(actor);
      assertRoleScope(actor, roles);
    }
  } else if (
    kind === "self-employment" ||
    (allowOwnEmployment && actor.alumniId === alumniIds[0] && alumniIds.length === 1)
  ) {
    const own = await linkedAlumni(context, tx);
    if (alumniIds.length !== 1 || own.id !== alumniIds[0])
      throw new ApiError("FORBIDDEN", { message: "You may only change your own employment." });
  } else if (kind === "restore") {
    requireAdministrator(context, "alumni.write");
  } else {
    management(
      context,
      kind === "tracking"
        ? "tracking.write"
        : kind === "archive"
          ? "alumni.delete"
          : "alumni.write",
    );
    if (kind === "assignment") await assignmentScope(context);
  }
  const own =
    kind === "account" ||
    kind === "member" ||
    kind === "self-employment" ||
    (allowOwnEmployment && actor.alumniId === alumniIds[0] && alumniIds.length === 1);
  const rows = await tx.Alumni.find({
    $and: [
      { _id: { $in: alumniIds }, deletedAt: kind === "restore" ? { $ne: null } : null },
      ...(own || kind === "restore" ? [] : [await alumniScopeFilter(context)]),
    ],
  }).lean();
  if (rows.length !== alumniIds.length)
    throw new ApiError("NOT_FOUND", { message: "One or more alumni records were not found." });
  return rows.map((row) => toEntity(row));
}

export async function beginAlumniTimestampEdit(
  context: Context,
  input: z.input<typeof timestampEditSchemas.begin.input>,
) {
  const parsed = timestampEditSchemas.begin.input.parse(input);
  const actor = requireAccess(context);
  const alumniIds = canonical(parsed.alumniIds);
  const kind: Kind = parsed.purpose;
  await authorizeResources(context, context.db, kind, alumniIds, parsed.purpose === "employment");
  return beginTimestampEdit(context.db, { ownerKey: ownerKey(context), alumniIds }, async (tx) => {
    const rows = await authorizeResources(
      context,
      tx,
      kind,
      alumniIds,
      parsed.purpose === "employment",
    );
    const users = await tx.User.find({ alumniId: { $in: alumniIds } }).lean();
    const jobs =
      parsed.purpose === "employment"
        ? await tx.Employment.find({ alumniId: { $in: alumniIds } }).lean()
        : [];
    return rows.map((row) => {
      const user = users.find((candidate) => String(candidate.alumniId) === row.id);
      return {
        id: row.id,
        names: {
          firstName: user?.firstName ?? row.firstName,
          middleName: user?.middleName ?? row.middleName ?? "",
          lastName: user?.lastName ?? row.lastName,
          suffix: user?.suffix ?? row.suffix ?? "",
        },
        ...(parsed.purpose === "details"
          ? {
              details: {
                studentNumber: row.studentNumber,
                programId: String(row.programId),
                graduationYear: row.graduationYear ?? null,
                gender: row.gender ?? "",
                batch: row.batch ?? "",
              },
            }
          : {}),
        ...(parsed.purpose === "employment"
          ? {
              employments: jobs
                .filter((job) => String(job.alumniId) === row.id)
                .map((job) => toEntity(job)),
            }
          : {}),
        ...(parsed.purpose === "assignment"
          ? { assignedFacultyId: row.assignedFacultyId ? String(row.assignedFacultyId) : null }
          : {}),
        ...(parsed.purpose === "account" && user && String(user._id) === actor.id
          ? {
              account: {
                phoneNumber: user.phoneNumber ?? "",
                gender: user.gender ?? "",
                facebookAccount: user.facebookAccount ?? "",
              },
            }
          : {}),
      };
    });
  });
}

export function timestampedService<I, O>(
  kind: Kind,
  action: (context: Context, input: I) => Promise<O>,
  mode: "edit" | "short" = "edit",
) {
  return async (context: Context, input: I): Promise<O> => {
    const alumniIds = canonical(await resources(context, context.db, kind, input));
    if (!alumniIds.length) return action(context, input);
    const authorize = async (tx: Database) => {
      const currentIds = canonical(await resources(context, tx, kind, input));
      if (currentIds.join() !== alumniIds.join()) throw new TimestampConflictError("scope");
      return authorizeResources(context, tx, kind, alumniIds);
    };
    await authorizeResources(context, context.db, kind, alumniIds);
    const mutate = (tx: Database, _rows: unknown, stamp: TransactionTimestamp) =>
      action({ ...context, db: tx, timestampWrite: { stamp, alumniIds } }, input);
    return mode === "short"
      ? runTimestampOperation(context.db, alumniIds, authorize, mutate)
      : commitTimestampEdit(
          context.db,
          { ownerKey: ownerKey(context), token: context.timestampEditToken ?? "", alumniIds },
          authorize,
          mutate,
        );
  };
}
