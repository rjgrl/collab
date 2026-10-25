import assert from "node:assert/strict";
import { it } from "node:test";
import { signupSchema, facebookSchema, accountProfileSchema, academicProfileSchema } from "./auth";
import { mobileSchema } from "./alumni";
import { normalizePhoneNumber } from "./phone";

it("normalizes international phone formats without restricting accounts to one country", () => {
  const phone = accountProfileSchema.shape.phoneNumber;
  for (const [input, canonical] of [
    ["+1 (213) 373-4253", "+12133734253"],
    ["+44 20 7946 0958", "+442079460958"],
    ["+61 412-345-678", "+61412345678"],
    ["+81 90-1234-5678", "+819012345678"],
  ])
    assert.equal(phone.parse(input), canonical);
  assert.equal(phone.safeParse("+44 invalid").success, false);
  assert.equal(phone.safeParse("+0123456789").success, false);
});

it("removes one redundant trunk zero using country rules and preserves significant zeros", () => {
  const phone = accountProfileSchema.shape.phoneNumber;
  for (const [input, canonical] of [
    ["+63 (0)917-123-4567", "+639171234567"],
    ["+44 (0)20 7946 0192", "+442079460192"],
    ["+61 0412 345 678", "+61412345678"],
    ["+81 090 1234 5678", "+819012345678"],
    ["+33 06 12 34 56 78", "+33612345678"],
    ["+49 (0)30 1234567", "+49301234567"],
    ["+55 (0)11 98765-4321", "+5511987654321"],
    ["+91 09876543210", "+919876543210"],
    ["+27 082 123 4567", "+27821234567"],
    ["+63\u00a0(0)917\u2011123\u20134567", "+639171234567"],
    ["+39 02 1234 5678", "+390212345678"],
    ["+39 06 6982", "+39066982"],
    ["+225 07 01 23 45 67", "+2250701234567"],
    ["+1 (213) 373.4253", "+12133734253"],
    ["+800 1234 5678", "+80012345678"],
  ] as const) {
    assert.equal(phone.parse(input), canonical, input);
    assert.equal(phone.parse(canonical), canonical, `Already normalized ${canonical}`);
  }
  for (const invalid of [
    "+44002079460192",
    "+33012345678",
    "+63009171234567",
    "+999012345678",
    "+44 invalid",
    "+44+2079460192",
    "+44 20 7946 0192 ext 5",
  ])
    assert.equal(phone.safeParse(invalid).success, false, invalid);
  assert.equal(normalizePhoneNumber("+33 (0)12345678"), "+3312345678");
});

it("normalizes imported international contacts without inventing a country for local legacy numbers", () => {
  assert.equal(mobileSchema.parse("+63 (0)917 123-4567"), "+639171234567");
  assert.equal(mobileSchema.parse("+39 (02) 1234 5678"), "+390212345678");
  assert.equal(mobileSchema.parse("(0917) 123-4567"), "09171234567");
  assert.equal(mobileSchema.parse(""), "");
  assert.equal(mobileSchema.parse(undefined), undefined);
  assert.equal(mobileSchema.safeParse("+63009171234567").success, false);
});

it("requires a graduation year in academic registration data", () => {
  const academic = { studentNumber: "SYN-YEAR", programId: "111111111111111111111111" };
  for (const graduationYear of [undefined, null, "", 1949, 2101, 2024.5])
    assert.equal(academicProfileSchema.safeParse({ ...academic, graduationYear }).success, false);
  assert.equal(
    academicProfileSchema.parse({ ...academic, graduationYear: 2024 }).graduationYear,
    2024,
  );
});

it("allows an empty optional Facebook link without throwing while rejecting malformed URLs", () => {
  assert.equal(facebookSchema.safeParse("").success, true);
  assert.equal(facebookSchema.safeParse("not a URL").success, false);
  assert.equal(
    signupSchema.safeParse({
      firstName: "Ana",
      lastName: "Reyes",
      email: "ana@example.test",
      password: "A private synthetic passphrase",
      phoneNumber: "+639171234567",
      gender: "Female",
      facebookAccount: "",
      studentNumber: "SYN-001",
      programId: "111111111111111111111111",
      graduationYear: 2024,
    }).success,
    true,
  );
});
