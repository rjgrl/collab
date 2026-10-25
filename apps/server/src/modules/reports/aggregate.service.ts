import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { requireAccess } from "@Alumni-Tracking-Ss/api/access";
import { summarizePopulation } from "./service";
const minimumCohort = 5;
const safe = (graduates: number, tracked: number) =>
  graduates === 0 ||
  (graduates >= minimumCohort &&
    (tracked === 0 || tracked >= minimumCohort) &&
    (graduates === tracked || graduates - tracked >= minimumCohort));
export async function aggregateSummary(context: Context) {
  requireAccess(context);
  const summary = await summarizePopulation(context);
  const suppressed = !safe(summary.graduates, summary.tracked);
  const departmentsSafe =
    !suppressed && summary.byDepartment.every((d) => safe(d.graduates, d.tracked));
  return {
    suppressed,
    minimumCohort,
    message: suppressed
      ? "Totals are withheld while cohorts are too small to protect alumni privacy."
      : departmentsSafe
        ? "Aggregate totals only. Personal records and exports are restricted to authorized staff."
        : "Department totals are withheld to prevent identifying small cohorts by subtraction.",
    totals: suppressed
      ? null
      : {
          graduates: summary.graduates,
          tracked: summary.tracked,
          untracked: summary.untracked,
          percentTracked: summary.percentTracked,
        },
    byDepartment: departmentsSafe ? summary.byDepartment : [],
  };
}
