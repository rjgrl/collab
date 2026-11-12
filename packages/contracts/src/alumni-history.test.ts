import assert from "node:assert/strict";
import { it } from "node:test";
import { describeHistoryEntry, formatHistoryValue } from "./alumni-history";

it("describes a new employment by its values, not null → value pairs", () => {
  const result = describeHistoryEntry({
    action: "employment.create",
    entity: "employment",
    summary: 'Added employment "adasd" for Alumni 000000000000000000000201',
    changes: [
      { field: "employer", old: null, new: "Acme" },
      { field: "jobTitle", old: null, new: "Analyst" },
      { field: "startDate", old: null, new: "2023-07-07T00:00:00.000Z" },
      { field: "isCurrent", old: null, new: true },
      { field: "status", old: null, new: "employed" },
      { field: "industry", old: null, new: "" },
    ],
  });
  assert.equal(result.title, "Added employment");
  assert.deepEqual(result.details, [
    "Employer: Acme",
    "Position: Analyst",
    "Start date: Jul 7, 2023",
    "Current job: Yes",
  ]);
  assert.ok(!result.details.join(" ").includes("null"));
});

it("shows edits as before → after with readable values", () => {
  const result = describeHistoryEntry({
    action: "alumni.update",
    entity: "alumni",
    summary: "",
    changes: [
      { field: "batch", old: "", new: "Batch A" },
      { field: "programId", old: "Synthetic BSIT", new: "000000000000000000000302" },
    ],
  });
  assert.deepEqual(result.details, [
    "Batch: empty → Batch A",
    "Program: Synthetic BSIT → a linked record",
  ]);
});

it("reads legacy tracking summaries instead of printing them", () => {
  const unchanged = describeHistoryEntry({
    action: "tracking.create",
    entity: "alumni",
    summary:
      'Recorded tracking for "Synthetic Graduate Four" (2021-0210): No audited fields changed.; source "manual"; notes "asd"',
    changes: [],
  });
  assert.deepEqual(unchanged, {
    title: "Recorded tracking",
    details: ["Status unchanged", "Notes: asd"],
  });
  const changed = describeHistoryEntry({
    action: "tracking.create",
    entity: "alumni",
    summary:
      'Recorded tracking for "X" (1): isTracked: false → true; source "google_forms"; notes ""',
    changes: [{ field: "isTracked", old: false, new: true }],
  });
  assert.deepEqual(changed, {
    title: "Marked tracked",
    details: ["Was Untracked", "Source: Google Forms"],
  });
});

it("uses stored tracking details for new entries", () => {
  assert.deepEqual(
    describeHistoryEntry({
      action: "tracking.create",
      entity: "alumni",
      summary: "",
      changes: [],
      tracking: { isTracked: false, source: "manual", notes: "Awaiting evidence" },
    }),
    { title: "Marked untracked", details: ["Notes: Awaiting evidence"] },
  );
});

it("strips database IDs and JSON quoting from summaries without field changes", () => {
  const result = describeHistoryEntry({
    action: "files.upload",
    entity: "evidence",
    summary:
      'Uploaded "proof.pdf" (application/pdf, 10 bytes) to Alumni profile 000000000000000000000201, employment 000000000000000000000401',
    changes: [],
  });
  assert.equal(result.details[0], "Uploaded proof.pdf (application/pdf, 10 bytes)");
  assert.equal(formatHistoryValue("isTracked", true), "Tracked");
  assert.equal(formatHistoryValue("x", "2024-01-02T09:30:00.000Z"), "Jan 2, 2024, 09:30 UTC");
});
