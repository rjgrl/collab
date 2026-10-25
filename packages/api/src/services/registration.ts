import type { Database } from "@Alumni-Tracking-Ss/db";
import { academicProfileSchema, type AuthInput } from "@Alumni-Tracking-Ss/contracts/auth";
import { ApiError } from "../http-error";

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
  if (await db.Alumni.exists({ studentNumber: academic.studentNumber }))
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
