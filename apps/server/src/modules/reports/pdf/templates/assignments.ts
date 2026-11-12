import { frame, table } from "./layout";

export type AssignmentGroup = {
  faculty: string;
  department: string;
  alumni: { studentNumber: string; name: string; program: string; isTracked: boolean }[];
};

export function assignmentReport(
  data: { groups: AssignmentGroup[]; unassigned: number; needsReassignment: number },
  meta: { generatedBy: string; generatedAt: Date },
) {
  const assigned = data.groups.reduce((sum, g) => sum + g.alumni.length, 0);
  return frame({
    title: "Faculty assignment report",
    subtitle: `${assigned} assigned · ${data.unassigned} unassigned · ${data.needsReassignment} need reassignment`,
    ...meta,
    content: [
      { text: "Summary", style: "section" },
      table(
        ["Faculty", "Department", "Assigned", "Tracked"],
        data.groups.map((g) => [
          g.faculty,
          g.department,
          g.alumni.length,
          g.alumni.filter((a) => a.isTracked).length,
        ]),
        ["*", "*", 60, 60],
      ),
      ...data.groups.flatMap((g) => [
        { text: `${g.faculty} — ${g.department}`, style: "section" },
        table(
          ["Student #", "Name", "Program", "Tracking"],
          g.alumni.map((a) => [
            a.studentNumber,
            a.name,
            a.program,
            a.isTracked ? "Tracked" : "Untracked",
          ]),
          [70, "*", 70, 60],
        ),
      ]),
    ],
  });
}
