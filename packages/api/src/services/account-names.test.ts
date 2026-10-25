import assert from "node:assert/strict";
import { it } from "node:test";
import { authSchemas } from "@Alumni-Tracking-Ss/contracts/auth";
import { usersSchemas } from "@Alumni-Tracking-Ss/contracts/users";
import { PERMISSION_KEYS } from "@Alumni-Tracking-Ss/db";
import type { Context } from "../context";
import { authService } from "../../../../apps/server/src/modules/auth/service";
import { usersService } from "../../../../apps/server/src/modules/users/service";
import { modelFixture } from "./model-test-fixture";
import { loadAuthUser } from "./session";

const id = "000000000000000000000001",
  alumniId = "000000000000000000000002";
const names = { firstName: "Ana", middleName: "María", lastName: "Dela Cruz", suffix: "Jr." };
function fixture() {
  const user = {
    id,
    ...names,
    name: "Ana María Dela Cruz Jr.",
    email: "ana@example.test",
    passwordHash: "private",
    status: "active",
    alumniId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const alumni = {
    id: alumniId,
    ...names,
    studentNumber: "2020-1",
    programId: "retained-program",
    isTracked: true,
    deletedAt: null,
  };
  const f = modelFixture({ User: [user], Alumni: [alumni] });
  const context = {
    db: f.db,
    user: {
      id,
      name: user.name,
      email: user.email,
      image: null,
      status: "active",
      roles: ["staff"],
      permissions: [],
      mfaEnrolled: true,
      mfaVerified: false,
    },
    sessionToken: "session",
    ipAddress: null,
    userAgent: null,
    integrationEnv: {},
  } as Context;
  return { ...f, user, alumni, context };
}
it("self-service structured name changes synchronize the linked profile despite old Staff enrollment", async () => {
  const f = fixture();
  await authService.updateProfile(f.context, { ...names, firstName: "Ana-Luz", suffix: "III" });
  assert.equal(f.user.name, "Ana-Luz María Dela Cruz III");
  assert.equal(f.alumni.firstName, "Ana-Luz");
  assert.equal(f.alumni.suffix, "III");
  assert.equal(f.alumni.studentNumber, "2020-1");
  assert.equal(f.alumni.programId, "retained-program");
  assert.equal(f.alumni.isTracked, true);
});
it("Settings account contact changes synchronize the linked profile and reset phone verification", async () => {
  const f = fixture();
  Object.assign(f.user, { phoneNumber: "+639171111111", phoneVerified: true, emailVerified: true });
  f.tables.VerificationChallenge = [
    { id: "old-phone", userId: id, kind: "phone" },
    { id: "email-proof", userId: id, kind: "email" },
  ];
  await authService.updateProfile(f.context, {
    ...names,
    phoneNumber: "+63 (917) 222-2222",
    gender: "Female",
    facebookAccount: "https://www.facebook.com/ana",
  });
  assert.equal(f.tables.User![0]!.phoneNumber, "+639172222222");
  assert.equal(f.tables.User![0]!.phoneVerified, false);
  assert.equal(f.tables.User![0]!.emailVerified, true);
  assert.equal(f.tables.Alumni![0]!.mobileNumber, "+639172222222");
  assert.equal(f.tables.Alumni![0]!.gender, "Female");
  assert.equal(f.tables.Alumni![0]!.facebookAccount, "https://www.facebook.com/ana");
  assert.equal(f.tables.Alumni![0]!.personalEmail, f.user.email);
  assert.deepEqual(
    f.tables.VerificationChallenge.map((row) => row.id),
    ["email-proof"],
  );
});
it("saving an unchanged phone preserves verification while strict Settings input rejects account/security hints", async () => {
  const f = fixture();
  Object.assign(f.user, { phoneNumber: "+639171234567", phoneVerified: true });
  await authService.updateProfile(f.context, { ...names, phoneNumber: "+63 (917) 123-4567" });
  assert.equal(f.tables.User![0]!.phoneVerified, true);
  for (const hostile of [
    { id: alumniId },
    { alumniId },
    { email: "other@example.test" },
    { phoneVerified: true },
  ])
    await assert.rejects(() => authService.updateProfile(f.context, { ...names, ...hostile }));
  assert.equal(f.user.email, "ana@example.test");
});
it("linked contact write failure rolls back account contact and verification changes", async () => {
  const f = fixture();
  Object.assign(f.user, { phoneNumber: "+639171111111", phoneVerified: true });
  f.failWrite("Alumni", "updateOne", new Error("Synthetic linked contact failure"));
  await assert.rejects(
    () =>
      authService.updateProfile(f.context, {
        ...names,
        phoneNumber: "+639172222222",
        gender: "Female",
      }),
    /linked contact failure/,
  );
  assert.equal(f.tables.User![0]!.phoneNumber, "+639171111111");
  assert.equal(f.tables.User![0]!.phoneVerified, true);
});
it("completed accounts cannot reuse onboarding to edit personal details outside Settings", async () => {
  const f = fixture();
  await assert.rejects(
    () =>
      authService.completeProfile(f.context, {
        ...names,
        firstName: "Bypass",
        phoneNumber: "+639171234567",
        gender: "Female",
      }),
    /Settings.*Account/,
  );
  assert.equal(f.operations.length, 0);
});
it("pending onboarding can complete personal details and synchronizes the linked contact data", async () => {
  const f = fixture();
  f.context.user!.needsProfileCompletion = true;
  Object.assign(f.user, { needsProfileCompletion: true, phoneVerified: true });
  await authService.completeProfile(f.context, {
    ...names,
    phoneNumber: "+639171234567",
    gender: "Female",
    facebookAccount: "",
  });
  assert.equal(f.tables.User![0]!.needsProfileCompletion, false);
  assert.equal(f.tables.User![0]!.phoneVerified, false);
  assert.equal(f.tables.Alumni![0]!.mobileNumber, "+639171234567");
  assert.equal(f.tables.Alumni![0]!.gender, "Female");
  assert.equal(f.tables.Alumni![0]!.personalEmail, f.user.email);
});
it("staff account edits through user management preserve missing name parts and synchronize linked alumni", async () => {
  const f = fixture();
  f.context.user = {
    ...f.context.user!,
    roles: ["super_admin"],
    permissions: [...PERMISSION_KEYS],
    mfaVerified: true,
  };
  const input = usersSchemas.update.input.parse({ id, firstName: "Ana-Luz" });
  await usersService.update(f.context, input);
  assert.equal(f.user.name, "Ana-Luz María Dela Cruz Jr.");
  assert.equal(f.alumni.firstName, "Ana-Luz");
  assert.equal(f.alumni.middleName, "María");
  assert.equal(f.alumni.suffix, "Jr.");
});
it("linked-profile write failure rolls back the account names and does not report success", async () => {
  const f = fixture();
  f.failWrite("Alumni", "updateOne", new Error("Synthetic linked write failure"));
  await assert.rejects(
    () => authService.updateProfile(f.context, { ...names, firstName: "Changed" }),
    /linked write failure/,
  );
  assert.equal(f.user.name, "Ana María Dela Cruz Jr.");
  assert.equal(f.user.firstName, "Ana");
  assert.equal(f.alumni.firstName, "Ana");
});
it("archived linked profiles fail the transaction rather than silently diverging names", async () => {
  const f = fixture();
  Object.assign(f.alumni, { deletedAt: new Date() });
  await assert.rejects(
    () => authService.updateProfile(f.context, { ...names, firstName: "Changed" }),
    /linked alumni profile is unavailable/,
  );
  assert.equal(f.user.name, "Ana María Dela Cruz Jr.");
});
it("profile and management contracts reject client-supplied display names and security fields", () => {
  assert.equal(
    authSchemas.updateProfile.input.safeParse({ ...names, name: "Forged" }).success,
    false,
  );
  assert.equal(usersSchemas.update.input.safeParse({ id, name: "Forged" }).success, false);
  assert.equal(
    authSchemas.completeProfile.input.safeParse({
      ...names,
      phoneNumber: "+639171234567",
      gender: "Female",
      alumniId,
    }).success,
    false,
  );
});
it("legacy display names remain unsplit until the account explicitly supplies separated names", async () => {
  const { db } = modelFixture({
    User: [
      {
        id,
        name: "Legacy Unsplit Name",
        email: "legacy@example.test",
        passwordHash: "private",
        status: "active",
      },
    ],
  });
  const user = await loadAuthUser(db, id);
  assert.equal(user?.name, "Legacy Unsplit Name");
  assert.equal(user?.firstName, undefined);
  assert.equal(user?.lastName, undefined);
});

it("completed Administrators cannot use onboarding to bypass MFA for account or linked-profile edits", async () => {
  const f = fixture();
  f.context.user = {
    ...f.context.user!,
    roles: ["super_admin"],
    needsProfileCompletion: false,
    mfaRequired: true,
    mfaVerified: false,
  };
  const input = authSchemas.completeProfile.input.parse({
    ...names,
    firstName: "Unverified change",
    gender: "Female",
    phoneNumber: "+639171234567",
  });
  await assert.rejects(() => authService.completeProfile(f.context, input), /authenticator/);
  assert.equal(f.user.firstName, "Ana");
  assert.equal(f.alumni.firstName, "Ana");
});
