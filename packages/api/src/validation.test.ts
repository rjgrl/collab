import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { csvToObjects, parseCsv, quoteCsv, toCsv } from "./validation";
import { mapFormPayload } from "./integrations/forms";

describe("csv quoting", () => {
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
      Program: "BSIT",
      Department: "IT",
      Tracked: "yes",
      Email: "kai.lim@example.com",
    });

    assert.equal(row.studentNumber, "2021-0099");
    assert.equal(row.programCode, "BSIT");
    assert.equal(row.departmentCode, "IT");
    assert.equal(row.isTracked, true);
    assert.equal(row.personalEmail, "kai.lim@example.com");
  });
});
