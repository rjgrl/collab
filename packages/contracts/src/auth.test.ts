import assert from "node:assert/strict";
import { it } from "node:test";
import { signupSchema, facebookSchema } from "./auth";

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
