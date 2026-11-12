import { formatDisplayName } from "@Alumni-Tracking-Ss/contracts/names";
import type { z } from "zod";
import type { alumniOutputSchema } from "@Alumni-Tracking-Ss/contracts/alumni";
import { frame, table, text } from "./layout";

// The template consumes exactly the public alumni contract, so it can never print a field
// the API would not expose.
export type ProfileSheetData = z.output<typeof alumniOutputSchema>;

const date = (value?: Date | null) => (value ? new Date(value).toISOString().slice(0, 10) : "—");

export function profileSheet(
  data: ProfileSheetData,
  meta: { generatedBy: string; generatedAt: Date; photo?: string | null },
) {
  return frame({
    title: `Alumni profile: ${formatDisplayName(data)}`,
    subtitle: `${data.program.department.name} / ${data.program.code} — ${data.program.name}`,
    ...meta,
    content: [
      { text: "Profile", style: "section" },
      table(
        ["Field", "Value"],
        [
          ["Student number", data.studentNumber],
          ["Gender", text(data.gender)],
          ["Graduation year", text(data.graduationYear)],
          ["Batch", text(data.batch)],
          ["Employment status", data.employmentStatus],
          ["Tracking", data.isTracked ? `Tracked (last ${date(data.lastTrackedAt)})` : "Untracked"],
          ["Assigned faculty", text(data.assignedFaculty?.name)],
        ],
        [140, "*"],
      ),
      { text: "Contacts", style: "section" },
      table(
        ["Type", "Value", "Label", "Primary"],
        data.contacts.map((c) => [c.type, c.value, text(c.label), c.isPrimary ? "Yes" : ""]),
        [70, "*", 90, 45],
      ),
      { text: "Employment", style: "section" },
      table(
        ["Employer", "Job title", "Start", "End", "Status"],
        data.employments.map((e) => [
          e.employer,
          text(e.jobTitle),
          date(e.startDate),
          e.isCurrent ? "Current" : date(e.endDate),
          e.status,
        ]),
        ["*", "*", 60, 60, 60],
      ),
      { text: "Tracking history", style: "section" },
      table(
        ["Recorded", "Status", "Source", "Notes"],
        data.trackingEvents
          .slice(0, 50)
          .map((t) => [
            date(t.recordedAt),
            t.isTracked ? "Tracked" : "Untracked",
            t.source,
            text(t.notes),
          ]),
        [60, 55, 60, "*"],
      ),
    ],
  });
}
