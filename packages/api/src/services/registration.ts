import type { Database } from "@Alumni-Tracking-Ss/db";
import type { Types } from "mongoose";
import { academicProfileSchema, type AuthInput } from "@Alumni-Tracking-Ss/contracts/auth";
import { ApiError } from "../http-error";
import { writeAudit } from "../audit";

/** An unconfirmed self-registration can be replaced by a new sign-up after this long. */
export const UNCONFIRMED_REGISTRATION_TTL_MS = 24 * 60 * 60 * 1000;

type RegistrationRow = {
  _id: Types.ObjectId;
  email: string;
  verificationRequired?: boolean | null;
  emailVerified?: boolean | null;
  createdAt?: Date | null;
  alumniId?: Types.ObjectId | null;
};

/**
 * Frees an email (and the student number of the profile it created) held by an Alumni
 * self-registration whose email was never confirmed, so nobody can lock a graduate out by
 * registering their details first. Allowed after 24 hours, or at once for a verified Google
 * identity of the same email. The profile is deleted only while untouched (no jobs, evidence,
 * tracking, contacts or tracker); otherwise it stays for an administrator to link.
 * Returns false, changing nothing, for any account that does not qualify.
 */
export async function releaseUnconfirmedRegistration(
  db: Database,
  user: RegistrationRow,
  options: { immediately?: boolean; reason: string; now?: Date; ipAddress?: string | null },
): Promise<boolean> {
  if (!user.verificationRequired || user.emailVerified) return false;
  const now = options.now ?? new Date();
  if (
    !options.immediately &&
    (!user.createdAt || now.getTime() - user.createdAt.getTime() < UNCONFIRMED_REGISTRATION_TTL_MS)
  )
    return false;
  const userId = user._id;
  const grants = await db.UserRole.find({ userId }).lean().exec();
  const roles = await db.Role.find({ _id: { $in: grants.map((grant) => grant.roleId) } })
    .lean()
    .exec();
  if (roles.some((role) => role.key !== "alumni")) return false;
  let profileReleased = false;
  if (user.alumniId) {
    const alumniId = user.alumniId;
    const profile = await db.Alumni.findOne({ _id: alumniId }).lean().exec();
    const touched =
      !profile ||
      profile.assignedFacultyId ||
      (await db.Employment.exists({ alumniId })) ||
      (await db.EvidenceFile.exists({ alumniId })) ||
      (await db.TrackingEvent.exists({ alumniId })) ||
      (await db.AlumniContact.exists({ alumniId })) ||
      (await db.User.exists({ alumniId, _id: { $ne: userId } }));
    if (!touched) {
      await db.Alumni.deleteOne({ _id: alumniId }).exec();
      profileReleased = true;
    }
  }
  for (const model of [
    db.Session,
    db.UserRole,
    db.VerificationChallenge,
    db.PasswordReset,
    db.MfaCredential,
    db.AccountPhoto,
  ] as const)
    await (model as typeof db.Session).deleteMany({ userId }).exec();
  await db.User.deleteOne({ _id: userId }).exec();
  await writeAudit(db, {
    actor: null,
    action: "auth.signup.released",
    entity: "user",
    entityId: String(userId),
    summary: `Released unconfirmed registration for ${user.email} (${options.reason})${profileReleased ? "; removed its untouched student profile" : ""}`,
    ipAddress: options.ipAddress,
  });
  return true;
}

// Caller owns the transaction: profile, account, role and audit commit together.
export async function createRegistrationProfile(
  db: Database,
  input: AuthInput<"completeProfile"> & { email: string },
) {
  const academic = academicProfileSchema.parse(input);
  const program = await db.Program.findOne({ _id: academic.programId, deletedAt: null }).lean();
  if (!program || !(await db.Department.exists({ _id: program.departmentId, deletedAt: null })))
    throw new ApiError("BAD_REQUEST", {
      message: "Select an active degree program and department.",
    });
  const existing = await db.Alumni.findOne({ studentNumber: academic.studentNumber }).lean();
  // A stale unconfirmed registration holding this student number gives it up.
  const holder = existing ? await db.User.findOne({ alumniId: existing._id }).lean() : null;
  if (
    existing &&
    !(
      holder &&
      (await releaseUnconfirmedRegistration(db, holder, {
        reason: "student number claimed by a new registration",
      })) &&
      !(await db.Alumni.exists({ studentNumber: academic.studentNumber }))
    )
  )
    throw new ApiError("CONFLICT", {
      message:
        "This student number has an existing profile. Ask an administrator to review and link your account; registration cannot claim it automatically.",
    });
  return db.Alumni.create({
    ...academic,
    firstName: input.firstName,
    middleName: input.middleName,
    lastName: input.lastName,
    suffix: input.suffix,
    gender: input.gender,
    mobileNumber: input.phoneNumber,
    personalEmail: input.email,
    facebookAccount: input.facebookAccount,
    isTracked: false,
  });
}
