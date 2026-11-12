import assert from "node:assert/strict";
import { it } from "node:test";
import {
  CONTACT_TYPES,
  contactInputSchema,
  normalizeContactPhone,
  socialUrlFromInput,
  socialUrlMatches,
} from "./contacts";

it("normalizes Philippine phone formats to E.164 and rejects invalid numbers", () => {
  for (const raw of ["09171234567", "+63 917 123 4567", "(0917) 123-4567", "639171234567"])
    assert.equal(normalizeContactPhone(raw), "+639171234567", raw);
  assert.equal(normalizeContactPhone("+1 202 555 0143")?.startsWith("+1"), true);
  for (const raw of ["", "12345", "0917", "not a phone"])
    assert.equal(normalizeContactPhone(raw), null, raw);
});

it("requires social links to be http(s) URLs on the platform's own domain", () => {
  assert.equal(socialUrlMatches("facebook", "https://www.facebook.com/someone"), true);
  assert.equal(socialUrlMatches("facebook", "https://m.facebook.com/someone"), true);
  assert.equal(socialUrlMatches("x", "https://twitter.com/someone"), true);
  assert.equal(socialUrlMatches("linkedin", "https://ph.linkedin.com/in/someone"), true);
  for (const bad of [
    "https://facebook.com.evil.test/someone",
    "https://notfacebook.com/someone",
    "javascript:alert(1)",
    "https://user:pass@facebook.com/x",
    "facebook.com/someone",
  ])
    assert.equal(socialUrlMatches("facebook", bad), false, bad);
  assert.equal(socialUrlMatches("other_social", "https://example.test/me"), true);
  assert.equal(socialUrlMatches("other_social", "ftp://example.test/me"), false);
});

it("validates each contact type and covers every declared type", () => {
  assert.deepEqual(contactInputSchema.parse({ type: "phone", value: "09171234567" }), {
    type: "phone",
    value: "+639171234567",
    label: "",
    isPrimary: false,
  });
  assert.equal(
    contactInputSchema.parse({ type: "email", value: " A@Example.TEST " }).value,
    "a@example.test",
  );
  assert.equal(contactInputSchema.safeParse({ type: "email", value: "nope" }).success, false);
  assert.equal(
    contactInputSchema.safeParse({ type: "instagram", value: "https://facebook.com/x" }).success,
    false,
  );
  assert.equal(contactInputSchema.safeParse({ type: "fax", value: "1" }).success, false);
  assert.deepEqual(
    contactInputSchema.options.map((option) => option.shape.type.value).sort(),
    [...CONTACT_TYPES].sort(),
  );
});

it("turns handles into platform URLs and leaves full URLs and other platforms alone", () => {
  assert.equal(socialUrlFromInput("instagram", "@someone"), "https://www.instagram.com/someone");
  assert.equal(socialUrlFromInput("linkedin", "someone"), "https://www.linkedin.com/in/someone");
  assert.equal(socialUrlFromInput("x", "https://x.com/a"), "https://x.com/a");
  assert.equal(socialUrlFromInput("other_social", "someone"), "someone");
  // Not a handle: left as typed so server validation rejects it visibly.
  assert.equal(socialUrlFromInput("facebook", "a b/c"), "a b/c");
  assert.equal(socialUrlMatches("instagram", socialUrlFromInput("instagram", "@someone")), true);
});
