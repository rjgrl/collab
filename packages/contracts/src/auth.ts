import { z } from "zod";
import { objectIdSchema, okSchema, paginationSchema } from "./common";
import { structuredNameSchema } from "./names";
import { phoneNumberSchema } from "./phone";

import { newPasswordSchema } from "./password-policy";
export { newPasswordSchema } from "./password-policy";
export const emailSchema = z.string().trim().max(254).email();
import { facebookSchema, graduationYearSchema } from "./alumni";
export { facebookSchema } from "./alumni";
export const accountProfileSchema = structuredNameSchema
  .extend({
    phoneNumber: phoneNumberSchema,
    gender: z.enum(["Male", "Female"]),
    facebookAccount: facebookSchema,
  })
  .strict();
const captcha = {
  recaptchaToken: z.string().max(8192).optional(),
  recaptchaFallback: z.boolean().optional(),
};
export const loginSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(256), ...captcha })
  .strict();
export const academicProfileSchema = z.object({
  studentNumber: z.string().trim().min(1).max(40),
  programId: objectIdSchema,
  graduationYear: graduationYearSchema,
});
export const completionProfileSchema = accountProfileSchema
  .extend(academicProfileSchema.partial().shape)
  .strict();
export const signupSchema = accountProfileSchema
  .extend({
    ...academicProfileSchema.shape,
    email: emailSchema,
    password: newPasswordSchema,
    ...captcha,
  })
  .strict();
export const updateProfileSchema = structuredNameSchema
  .extend({
    phoneNumber: accountProfileSchema.shape.phoneNumber.optional(),
    gender: accountProfileSchema.shape.gender.optional(),
    facebookAccount: facebookSchema,
  })
  .strict();
export const authUserSchema = z.object({
  id: objectIdSchema,
  name: z.string(),
  email: emailSchema,
  image: z.string().nullable(),
  firstName: z.string().optional(),
  middleName: z.string().optional(),
  lastName: z.string().optional(),
  suffix: z.string().optional(),
  alumniId: objectIdSchema.nullable().optional(),
  isAlumni: z.boolean().optional(),
  status: z.enum(["active", "disabled"]),
  needsProfileCompletion: z.boolean().optional(),
  needsPassword: z.boolean().optional(),
  mfaRequired: z.boolean().optional(),
  mfaEnrolled: z.boolean().optional(),
  mfaVerified: z.boolean().optional(),
  mfaFresh: z.boolean().optional(),
  mfaVersion: z.string().optional(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
});
export type AuthUser = z.infer<typeof authUserSchema>;
export const noInputSchema = z.object({}).strict().default({});
export const sessionResultSchema = z.object({
  user: authUserSchema.nullable(),
  sessionToken: z.string(),
  expiresAt: z.string().datetime(),
});
export const rotationResultSchema = okSchema.extend({
  sessionToken: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});
export const verificationStatusSchema = z.object({
  email: emailSchema,
  emailVerified: z.boolean(),
  pendingEmail: emailSchema.nullable().optional(),
  phoneVerified: z.boolean(),
  phoneNumber: z.string(),
  gender: z.string(),
  facebookAccount: z.string(),
  profileNeeded: z.boolean(),
  academicNeeded: z.boolean().optional(),
  passwordNeeded: z.boolean(),
  emailNeeded: z.boolean(),
  phoneNeeded: z.boolean(),
  googleFresh: z.boolean(),
  canSendEmail: z.boolean(),
  canSendPhone: z.boolean(),
  ready: z.boolean(),
});
export const authSchemas = {
  registrationPrograms: {
    input: paginationSchema.optional(),
    output: z.array(
      z.object({
        id: objectIdSchema,
        code: z.string(),
        name: z.string(),
        department: z.object({ id: objectIdSchema, name: z.string() }),
      }),
    ),
  },
  config: {
    input: noInputSchema,
    output: z.object({
      signupEnabled: z.boolean(),
      contactVerification: z
        .object({ email: z.boolean(), phone: z.boolean(), localBypass: z.boolean() })
        .optional(),
      recaptcha: z.object({
        enabled: z.boolean(),
        live: z.boolean(),
        siteKey: z.string().nullable(),
      }),
      google: z.object({ enabled: z.boolean() }),
    }),
  },
  me: { input: noInputSchema, output: authUserSchema.nullable() },
  login: { input: loginSchema, output: z.object({ user: authUserSchema.nullable() }) },
  signup: { input: signupSchema, output: z.object({ user: authUserSchema.nullable() }) },
  logout: { input: noInputSchema, output: okSchema },
  forgotPassword: {
    input: z.object({ email: emailSchema }).strict(),
    output: okSchema.extend({ message: z.string() }),
  },
  resetPassword: {
    input: z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: newPasswordSchema })
      .strict(),
    output: okSchema,
  },
  mfaStatus: {
    input: noInputSchema,
    output: z.object({
      enrolled: z.boolean(),
      required: z.boolean(),
      enforcementDisabled: z.boolean(),
      verified: z.boolean(),
      fresh: z.boolean(),
      configured: z.boolean(),
    }),
  },
  beginMfa: {
    input: z.object({ password: z.string().min(1).max(256) }).strict(),
    output: z.object({ secret: z.string(), uri: z.string(), expiresInSeconds: z.number() }),
  },
  confirmMfa: {
    input: z.object({ code: z.string().regex(/^\d{6}$/) }).strict(),
    output: z.object({
      recoveryCodes: z.array(z.string()),
      sessionToken: z.string().optional(),
      expiresAt: z.string().datetime().optional(),
    }),
  },
  verifyMfa: {
    input: z.object({ code: z.string().regex(/^(\d{6}|[a-fA-F0-9]{32})$/) }).strict(),
    output: rotationResultSchema,
  },
  verificationStatus: { input: noInputSchema, output: verificationStatusSchema },
  sendVerification: {
    input: z.object({ kind: z.enum(["email", "phone"]) }).strict(),
    output: okSchema.extend({ expiresInSeconds: z.number(), resendAfterSeconds: z.number() }),
  },
  confirmVerification: {
    input: z
      .object({ kind: z.enum(["email", "phone"]), code: z.string().regex(/^\d{6}$/) })
      .strict(),
    output: okSchema,
  },
  requestEmailChange: {
    input: z.object({ email: emailSchema, currentPassword: z.string().min(1).max(256) }).strict(),
    output: okSchema.extend({ expiresInSeconds: z.number(), resendAfterSeconds: z.number() }),
  },
  confirmEmailChange: {
    input: z
      .object({
        email: emailSchema,
        currentPassword: z.string().min(1).max(256),
        code: z.string().regex(/^\d{6}$/),
      })
      .strict(),
    output: rotationResultSchema,
  },
  createGooglePassword: {
    input: z
      .object({ password: newPasswordSchema, confirmation: z.string().max(256) })
      .strict()
      .refine((value) => value.password === value.confirmation, {
        message: "Passwords must match.",
        path: ["confirmation"],
      }),
    output: rotationResultSchema,
  },
  completeProfile: { input: completionProfileSchema, output: okSchema },
  updateProfile: { input: updateProfileSchema, output: okSchema },
  changePassword: {
    input: z
      .object({ currentPassword: z.string().min(1).max(256), password: newPasswordSchema })
      .strict(),
    output: rotationResultSchema,
  },
};
export type AuthInput<K extends keyof typeof authSchemas> = z.infer<
  (typeof authSchemas)[K]["input"]
>;
export type AuthOutput<K extends keyof typeof authSchemas> = z.infer<
  (typeof authSchemas)[K]["output"]
>;
