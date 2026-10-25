import assert from "node:assert/strict";
import { it } from "node:test";
import { signupSchema, facebookSchema, accountProfileSchema } from "./auth";

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
    }).success,
    true,
  );
});
