import { Card, CardContent, CardHeader, CardTitle } from "@Alumni-Tracking-Ss/ui/components/card";
import { Skeleton } from "@Alumni-Tracking-Ss/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { FormSelect } from "@/components/forms/form-select";
import { FilterBar } from "@/components/data/filter-bar";
import { PageHeader, PageShell } from "@/components/layout/page";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { PrimaryButton } from "@/components/forms/form-layout";
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
  const [departmentId, setDepartmentId] = useState("");
  const [tracked, setTracked] = useState<"all" | "tracked" | "untracked">("all");
  // Export-only filters; the summary totals above use department and tracking only.
  const [collegeId, setCollegeId] = useState("");
  const [programId, setProgramId] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [batch, setBatch] = useState("");
  const colleges = useCollegeOptions();
  const programs = useProgramOptions();
  const exportFilters = {
    collegeId: collegeId || undefined,
    departmentId: departmentId || undefined,
    programId: programId || undefined,
    graduationYear: graduationYear ? Number(graduationYear) : undefined,
    batch: batch || undefined,
    tracked,
  };
  const pdf = useMutation({
    mutationFn: (kind: "alumni" | "assignments") =>
      kind === "alumni"
        ? downloadPdf("/api/reports/alumni.pdf", exportFilters)
        : downloadPdf("/api/reports/assignments.pdf"),
    onSuccess: () => toast.success("PDF downloaded"),
    onError: (error) => toast.error(error.message),
  });
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
          <CardTitle>Current totals</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3 sm:divide-x">
            {(
              [
                ["Graduates", summary.data?.graduates.toLocaleString()],
                ["Tracked", summary.data?.tracked.toLocaleString()],
                [
                  "% tracked",
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
          {summary.isError ? (
            <ErrorAlert className="mt-4" onRetry={() => void summary.refetch()}>
              Could not load report totals.
            </ErrorAlert>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Export alumni</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <FilterBar>
            <FormSelect
              className="w-full sm:w-auto sm:min-w-44"
              value={departmentId}
              onValueChange={(selected) => setDepartmentId(selected)}
              aria-label="Department"
              items={[
                { value: "", label: "All departments" },
                ...(summary.data?.departments.map((department) => ({
                  value: department.id,
                  label: department.name,
                })) ?? []),
              ]}
            />
            <FormSelect
              className="w-full sm:w-auto sm:min-w-44"
              value={tracked}
              onValueChange={(selected) => setTracked(selected as typeof tracked)}
              aria-label="Tracking"
              items={[
                { value: "all", label: "All tracking" },
                { value: "tracked", label: "Tracked" },
                { value: "untracked", label: "Untracked" },
              ]}
            />
            <FormSelect
              className="w-full sm:w-auto sm:min-w-44"
              value={collegeId}
              onValueChange={setCollegeId}
              aria-label="College"
              items={[
                { value: "", label: "All colleges" },
                ...(colleges.data?.map((college) => ({ value: college.id, label: college.name })) ??
                  []),
              ]}
            />
            <FormSelect
              className="w-full sm:w-auto sm:min-w-44"
              value={programId}
              onValueChange={setProgramId}
              aria-label="Program"
              items={[
                { value: "", label: "All programs" },
                ...(programs.data?.map((program) => ({
                  value: program.id,
                  label: `${program.code} — ${program.name}`,
                })) ?? []),
              ]}
            />
            <Input
              className="w-full sm:w-32"
              type="number"
              min={1950}
              max={2100}
              inputMode="numeric"
              placeholder="Grad. year"
              aria-label="Graduation year"
              value={graduationYear}
              onChange={(event) => setGraduationYear(event.target.value)}
            />
            <Input
              className="w-full sm:w-32"
              maxLength={40}
              placeholder="Batch"
              aria-label="Batch"
              value={batch}
              onChange={(event) => setBatch(event.target.value)}
            />
          </FilterBar>
          {can(session.data?.permissions, "reports.export") ? (
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
              <QuietButton onClick={() => pdf.mutate("assignments")} disabled={pdf.isPending}>
                Assignment report (PDF)
              </QuietButton>
              {session.data && isAdministrator(session.data) ? (
                <QuietButton
                  onClick={() => exportSheets.mutate()}
                  disabled={exportSheets.isPending}
                >
                  {exportSheets.isPending ? "Exporting..." : "Export to Google Sheets"}
                </QuietButton>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">You can view totals but cannot export.</p>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
