import { formatDisplayName } from "@Alumni-Tracking-Ss/contracts/names";
import { frame, table, text } from "./layout";

export type AlumniListRow = {
  studentNumber: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  suffix?: string | null;
  graduationYear?: number | null;
  batch?: string | null;
  isTracked: boolean;
  employmentStatus: string;
  phone: string;
  email: string;
  program: { code: string; department: { name: string } };
};

export function alumniList(
  rows: AlumniListRow[],
  meta: { generatedBy: string; generatedAt: Date; filters: string },
) {
  const tracked = rows.filter((r) => r.isTracked).length;
  return frame({
    title: "Alumni list",
    subtitle: `${meta.filters} · ${rows.length} alumni · ${tracked} tracked`,
    generatedBy: meta.generatedBy,
    generatedAt: meta.generatedAt,
    landscape: true,
    content: [
      table(
        [
          "Student #",
          "Name",
          "Department",
          "Program",
          "Year",
          "Batch",
          "Tracking",
          "Employment",
          "Phone",
          "Email",
        ],
        rows.map((r) => [
          r.studentNumber,
          formatDisplayName(r),
          r.program.department.name,
          r.program.code,
          text(r.graduationYear),
          text(r.batch),
          r.isTracked ? "Tracked" : "Untracked",
          r.employmentStatus,
          text(r.phone),
          text(r.email),
        ]),
        [55, "*", 80, 45, 30, 40, 45, 50, 70, "*"],
      ),
    ],
  });
}
