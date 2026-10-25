import { Card, CardContent, CardHeader, CardTitle } from "@Alumni-Tracking-Ss/ui/components/card";
import { Skeleton } from "@Alumni-Tracking-Ss/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { FormSelect } from "@/components/form-select";
import { FilterBar, PageHeader, PageShell, PrimaryButton } from "@/components/page-header";
import { QuietButton } from "@/components/data-table";
import { isAdministrator } from "@Alumni-Tracking-Ss/contracts/names";
import { can, useSession } from "@/lib/session";
import { client, api } from "@/utils/api";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const session = useSession();
  const [departmentId, setDepartmentId] = useState("");
  const [tracked, setTracked] = useState<"all" | "tracked" | "untracked">("all");
  const summary = useQuery(
    api.reports.summary.queryOptions({
      input: { departmentId: departmentId || undefined, tracked },
    }),
  );

  const exportCsv = useMutation({
    mutationFn: () =>
      client.reports.alumniCsv({
        departmentId: departmentId || undefined,
        tracked,
      }),
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
            <p
              role="alert"
              className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm"
            >
              Could not load report totals.
              <QuietButton onClick={() => void summary.refetch()}>Retry</QuietButton>
            </p>
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
