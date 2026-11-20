import { Card, CardContent, CardHeader, CardTitle } from "@Alumni-Tracking-Ss/ui/components/card";
import { Skeleton } from "@Alumni-Tracking-Ss/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { FormSelect } from "@/components/forms/form-select";
import { PageHeader, PageShell } from "@/components/layout/page";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { FormField, PrimaryButton } from "@/components/forms/form-layout";
import { QuietButton } from "@/components/data/data-table";
import { isAdministrator } from "@Alumni-Tracking-Ss/contracts/names";
import { can, useSession } from "@/lib/session";
import { client, api, downloadPdf } from "@/lib/api";
import { useCollegeOptions, useProgramOptions } from "@/lib/academic-options";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const session = useSession();
  const canExport = can(session.data?.permissions, "reports.export");
  const [departmentId, setDepartmentId] = useState("");
  const [tracked, setTracked] = useState<"all" | "tracked" | "untracked">("all");
  const [collegeId, setCollegeId] = useState("");
  const [programId, setProgramId] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const colleges = useCollegeOptions();
  const programs = useProgramOptions();
  const exportFilters = {
    collegeId: collegeId || undefined,
    departmentId: departmentId || undefined,
    programId: programId || undefined,
    graduationYear: graduationYear ? Number(graduationYear) : undefined,
    tracked,
  };
  const pdf = useMutation({
    mutationFn: (kind: "alumni" | "assignments") =>
      kind === "alumni"
        ? downloadPdf("/reports/alumni.pdf", exportFilters)
        : downloadPdf("/reports/assignments.pdf"),
    onSuccess: () => toast.success("PDF downloaded"),
    onError: (error) => toast.error(error.message),
  });
  const departmentOptions = useQuery(
    api.reports.summary.queryOptions({ input: { tracked: "all" } }),
  );
  const summary = useQuery(
    api.reports.summary.queryOptions({
      input: { departmentId: departmentId || undefined, tracked },
    }),
  );

  const exportCsv = useMutation({
    mutationFn: () => client.reports.alumniCsv(exportFilters),
    onSuccess: (result) => {
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${result.count} rows`);
    },
    onError: (error) => toast.error(error.message),
  });

  const exportSheets = useMutation({
    mutationFn: () =>
      client.integrations.exportSheets({ departmentId: departmentId || undefined, tracked }),
    onSuccess: (result) => toast.success(`Wrote ${result.count} rows to Google Sheets`),
    onError: (error) => toast.error(error.message),
  });

  return (
    <PageShell>
      <PageHeader
        title="Reports"
        description="Graduate tracking reports generated from live alumni data. CSV is the default export; Google Sheets is used when configured."
      />
      <Card>
        <CardHeader>
          <CardTitle>Current Totals</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3 sm:divide-x">
            {(
              [
                ["Graduates", summary.data?.graduates.toLocaleString()],
                ["Tracked", summary.data?.tracked.toLocaleString()],
                [
                  "% Tracked",
                  summary.data ? `${summary.data.percentTracked.toFixed(2)}%` : undefined,
                ],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="min-w-0 sm:px-5 sm:first:pl-0">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-2 text-2xl font-medium tabular-nums">
                  {summary.isPending ? <Skeleton className="h-8 w-20" /> : (value ?? "—")}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Totals reflect Department and Tracking Status.
          </p>
          {summary.isError ? (
            <ErrorAlert className="mt-4" onRetry={() => void summary.refetch()}>
              Could not load report totals.
            </ErrorAlert>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Export Alumni</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField id="report-college" label="College">
              <FormSelect
                id="report-college"
                className="w-full"
                value={collegeId}
                onValueChange={setCollegeId}
                items={[
                  { value: "", label: "All Colleges" },
                  ...(colleges.data?.map((college) => ({
                    value: college.id,
                    label: college.name,
                  })) ?? []),
                ]}
              />
            </FormField>
            <FormField id="report-department" label="Department">
              <FormSelect
                id="report-department"
                className="w-full"
                value={departmentId}
                onValueChange={setDepartmentId}
                disabled={departmentOptions.isPending || departmentOptions.isError}
                items={[
                  { value: "", label: "All Departments" },
                  ...(departmentOptions.data?.departments.map((department) => ({
                    value: department.id,
                    label: department.name,
                  })) ?? []),
                ]}
              />
              {departmentOptions.isError ? (
                <ErrorAlert onRetry={() => void departmentOptions.refetch()}>
                  Could not load department options.
                </ErrorAlert>
              ) : null}
            </FormField>
            <FormField id="report-program" label="Program">
              <FormSelect
                id="report-program"
                className="w-full"
                value={programId}
                onValueChange={setProgramId}
                items={[
                  { value: "", label: "All Programs" },
                  ...(programs.data?.map((program) => ({
                    value: program.id,
                    label: `${program.code} — ${program.name}`,
                  })) ?? []),
                ]}
              />
            </FormField>
            <FormField id="report-graduation-year" label="Graduation Year">
              <Input
                id="report-graduation-year"
                type="number"
                min={1950}
                max={2100}
                inputMode="numeric"
                placeholder="All Years"
                value={graduationYear}
                onChange={(event) => setGraduationYear(event.target.value)}
              />
            </FormField>
            <FormField id="report-tracking" label="Tracking Status">
              <FormSelect
                id="report-tracking"
                className="w-full"
                value={tracked}
                onValueChange={(selected) => setTracked(selected as typeof tracked)}
                items={[
                  { value: "all", label: "All Tracking" },
                  { value: "tracked", label: "Tracked" },
                  { value: "untracked", label: "Untracked" },
                ]}
              />
            </FormField>
          </div>
          {canExport ? (
            <div className="flex flex-col gap-4 border-t pt-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold">Alumni Downloads</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  CSV and alumni PDF use all filters above.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <PrimaryButton
                  onClick={() => exportCsv.mutate()}
                  pending={exportCsv.isPending}
                  pendingLabel="Downloading"
                >
                  Download CSV
                </PrimaryButton>
                <QuietButton onClick={() => pdf.mutate("alumni")} disabled={pdf.isPending}>
                  Download PDF
                </QuietButton>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">You can view totals but cannot export.</p>
          )}
        </CardContent>
      </Card>
      {canExport ? (
        <Card>
          <CardHeader>
            <CardTitle>Other Exports</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col items-start gap-3">
              <div>
                <h3 className="text-sm font-semibold">Faculty Assignments</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  All assignments in your authorized scope. Alumni filters do not apply.
                </p>
              </div>
              <QuietButton onClick={() => pdf.mutate("assignments")} disabled={pdf.isPending}>
                Assignment Report (PDF)
              </QuietButton>
            </div>
            {session.data && isAdministrator(session.data) ? (
              <div className="flex flex-col items-start gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Google Sheets</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Uses Department and Tracking Status only.
                  </p>
                </div>
                <QuietButton
                  onClick={() => exportSheets.mutate()}
                  disabled={exportSheets.isPending}
                >
                  {exportSheets.isPending ? "Exporting..." : "Export to Google Sheets"}
                </QuietButton>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  );
}
