import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  alumniInputSchema,
  alumniImportRowSchema,
  facebookSchema,
  csvToObjects,
  parseCsv,
  quoteCsv,
  toCsv,
} from "./validation";
import { mapFormPayload } from "./integrations/forms";

describe("alumni fields", () => {
  const profile = {
    studentNumber: "2020-0001",
    firstName: "Ana",
    lastName: "Cruz",
    programId: "000000000000000000000301",
  };
  it("requires Male or Female on creation and editing", () => {
    for (const gender of [undefined, "", "Other", "male"]) {
      assert.equal(alumniInputSchema.safeParse({ ...profile, gender }).success, false);
    }
    for (const gender of ["Male", "Female"]) {
      assert.equal(alumniInputSchema.safeParse({ ...profile, gender }).success, true);
    }
    assert.equal(
      alumniInputSchema.safeParse({ ...profile, gender: "Female", batch: "2020" }).success,
      false,
    );
  });
  it("accepts optional Facebook URLs and rejects usernames and unsafe links", () => {
    for (const value of [
      undefined,
      "",
      "https://www.facebook.com/ana.cruz",
      "https://m.facebook.com/profile.php?id=123",
    ]) {
      assert.equal(facebookSchema.safeParse(value).success, true);
    }
    for (const value of [
      "ana.cruz",
      "javascript:alert(1)",
      "https://facebook.com.evil.test/ana",
      "https://example.com",
      "https://facebook.com@evil.test/ana",
    ]) {
      assert.equal(facebookSchema.safeParse(value).success, false);
    }
  });
  it("applies the same gender and Facebook rules to imports", () => {
    const row = { ...profile, programCode: "BSIT", departmentName: "IT" };
    assert.equal(alumniImportRowSchema.safeParse(row).success, false);
    assert.equal(
      alumniImportRowSchema.safeParse({ ...row, gender: "Female", facebookAccount: "username" })
        .success,
      false,
    );
    assert.equal(
      alumniImportRowSchema.safeParse({
        ...row,
        gender: "Female",
        facebookAccount: "https://facebook.com/ana",
      }).success,
      true,
    );
  });
});

describe("csv quoting", () => {
  it("neutralizes spreadsheet formulas while preserving numeric cells", () => {
    const csv = toCsv(
      ["formula", "number"],
      [
        ["=HYPERLINK(1)", -10],
        ["\t+cmd", 2],
      ],
    );
    assert.equal(parseCsv(csv)[1]?.[0], "'=HYPERLINK(1)");
    assert.equal(parseCsv(csv)[1]?.[1], "-10");
    assert.equal(parseCsv(csv)[2]?.[0], "'\t+cmd");
  });
  it("quotes commas and quotes", () => {
    assert.equal(quoteCsv('IT, "track"'), '"IT, ""track"""');
    assert.equal(quoteCsv("plain"), "plain");
  });

  it("round-trips rows", () => {
    const csv = toCsv(
      ["studentNumber", "firstName"],
      [
        ["2020-0001", "Ana"],
        ["2020-0002", 'Luis, "Jr"'],
      ],
    );
    const parsed = csvToObjects(csv);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0]?.studentNumber, "2020-0001");
    assert.equal(parsed[1]?.firstName, 'Luis, "Jr"');
  });

  it("parses empty input as no rows", () => {
    assert.deepEqual(parseCsv(""), []);
  });
});

describe("google form mapping", () => {
  it("maps common form titles onto alumni fields", () => {
    const row = mapFormPayload({
      "Student Number": "2021-0099",
      "First Name": "Kai",
      "Last Name": "Lim",
      Gender: "Male",
      Program: "BSIT",
      Department: "IT",
      Tracked: "yes",
      Email: "kai.lim@example.com",
    });

    assert.equal(row.studentNumber, "2021-0099");
    assert.equal(row.programCode, "BSIT");
    assert.equal(row.departmentName, "IT");
    assert.equal(row.isTracked, true);
    assert.equal(row.personalEmail, "kai.lim@example.com");
  });
});
