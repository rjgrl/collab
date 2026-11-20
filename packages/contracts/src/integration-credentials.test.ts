import assert from "node:assert/strict";
import { it } from "node:test";
import { credentialsError, INTEGRATION_CREDENTIAL_FIELDS } from "./integration-credentials";

it("Gmail accepts an address and grouped or ungrouped 16-character App Password", () => {
  for (const gmailAppPassword of ["abcdefghijklmnop", "abcd efgh ijkl mnop"])
    assert.equal(
      credentialsError("email", { fromAddress: "sender@gmail.com", gmailAppPassword }),
      null,
    );
  assert.deepEqual(
    INTEGRATION_CREDENTIAL_FIELDS.email.map((field) => field.name),
    ["fromAddress", "gmailAppPassword"],
  );
});
it("Gmail rejects invalid addresses, missing App Passwords and old provider keys", () => {
  assert.match(
    credentialsError("email", { fromAddress: "not-email", gmailAppPassword: "abcdefghijklmnop" })!,
    /email address/,
  );
  assert.match(
    credentialsError("email", { fromAddress: "sender@gmail.com", apiKey: "legacy-secret" })!,
    /Gmail App Password is required/,
  );
  assert.match(
    credentialsError("email", {
      fromAddress: "sender@gmail.com",
      gmailAppPassword: "normal-password",
    })!,
    /16-character/,
  );
});
