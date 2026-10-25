import { Card, CardContent, CardHeader, CardTitle } from "@Alumni-Tracking-Ss/ui/components/card";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/native-select";
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
        <CardContent className="text-sm">
          Graduates {summary.data?.graduates ?? "—"} · Tracked {summary.data?.tracked ?? "—"} ·{" "}
          {summary.data?.percentTracked ?? "—"}% tracked
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Export alumni</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <FilterBar>
            <NativeSelect
              className="w-auto min-w-36"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              aria-label="Department"
            >
              <option value="">All departments</option>
              {summary.data?.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              className="w-auto min-w-36"
              value={tracked}
              onChange={(event) => setTracked(event.target.value as typeof tracked)}
              aria-label="Tracking"
            >
              <option value="all">All tracking</option>
              <option value="tracked">Tracked</option>
              <option value="untracked">Untracked</option>
            </NativeSelect>
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
