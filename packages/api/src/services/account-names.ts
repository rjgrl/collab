import { toEntity, type Database } from "@Alumni-Tracking-Ss/db";
import {
  structuredNameSchema,
  formatDisplayName,
  type StructuredName,
} from "@Alumni-Tracking-Ss/contracts/names";
import { ApiError } from "../http-error";

// Call only inside the caller's transaction: account fields own linked profile names.
export async function updateAccountNames(
  tx: Database,
  userId: string,
  input: Partial<StructuredName>,
  extra: Record<string, unknown> = {},
) {
  const row = await tx.User.findById(userId).lean().exec();
  if (!row) throw new ApiError("NOT_FOUND", { message: "User not found." });
  const current = toEntity(row);
  const names = structuredNameSchema.parse({
    firstName: current.firstName,
    middleName: current.middleName ?? "",
    lastName: current.lastName,
    suffix: current.suffix ?? "",
    ...input,
  });
  const claim = await tx.User.updateOne(
    { _id: current.id, updatedAt: current.updatedAt },
    {
      $set: {
        ...extra,
        ...names,
        name: formatDisplayName(names),
        updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)),
      },
    },
    { timestamps: false },
  ).exec();
  if (claim.modifiedCount !== 1)
    throw new ApiError("CONFLICT", { message: "Account changed. Reload before saving." });
  if (current.alumniId) {
    const alumni = await tx.Alumni.findOne({ _id: current.alumniId, deletedAt: null })
      .lean()
      .exec();
    if (!alumni)
      throw new ApiError("CONFLICT", {
        message:
          "The linked alumni profile is unavailable. Ask an administrator to review the link.",
      });
    const synchronized = await tx.Alumni.updateOne(
      { _id: current.alumniId, deletedAt: null },
      {
        $set: {
          ...names,
          ...(extra.phoneNumber !== undefined ? { mobileNumber: extra.phoneNumber } : {}),
          ...(extra.gender !== undefined ? { gender: extra.gender } : {}),
          ...(extra.facebookAccount !== undefined
            ? { facebookAccount: extra.facebookAccount }
            : {}),
          ...(extra.phoneNumber !== undefined ||
          extra.gender !== undefined ||
          extra.facebookAccount !== undefined
            ? { personalEmail: current.email }
            : {}),
        },
      },
    ).exec();
    if (synchronized.matchedCount !== 1)
      throw new ApiError("CONFLICT", {
        message: "The linked alumni profile changed. Reload before saving.",
      });
  }
}
