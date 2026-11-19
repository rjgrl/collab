import assert from "node:assert/strict";
import { it } from "node:test";
import { signupEmailSchema } from "./auth";
it("signup accepts only exact BukSU institutional domains, not local demo exceptions", () => {
  for (const email of ["user@buksu.edu.ph", "USER@STUDENT.BUKSU.EDU.PH"])
    assert.equal(signupEmailSchema.safeParse(email).success, true);
  for (const email of [
    "user@gmail.com",
    "admin@collab.test",
    "user@buksu.edu.ph.evil.com",
    "invalid",
  ]) {
    const parsed = signupEmailSchema.safeParse(email);
    assert.equal(parsed.success, false);
    if (!parsed.success) assert.ok(!parsed.error.message.includes("@collab.test"));
  }
});
