import { Card, CardContent, CardHeader, CardTitle } from "@Alumni-Tracking-Ss/ui/components/card";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader, PrimaryButton } from "@/components/page-header";
import { can, useSession } from "@/lib/session";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const session = useSession();
  const departments = useQuery(orpc.departments.list.queryOptions({ input: {} }));
  const summary = useQuery(orpc.dashboard.summary.queryOptions({ input: {} }));
  const [departmentId, setDepartmentId] = useState("");
  const [tracked, setTracked] = useState<"all" | "tracked" | "untracked">("all");

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
    mutationFn: () => client.integrations.exportSheets(),
    onSuccess: (result) => toast.success(`Wrote ${result.count} rows to Google Sheets`),
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-6">
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
          <div className="flex flex-wrap gap-2">
            <select
              className="h-8 border border-input bg-transparent px-2 text-xs"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
            >
              <option value="">All departments</option>
              {departments.data?.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.code}
                </option>
              ))}
            </select>
            <select
              className="h-8 border border-input bg-transparent px-2 text-xs"
              value={tracked}
              onChange={(event) => setTracked(event.target.value as typeof tracked)}
            >
              <option value="all">All</option>
              <option value="tracked">Tracked</option>
              <option value="untracked">Untracked</option>
            </select>
          </div>
          {can(session.data?.permissions, "reports.export") ? (
            <div className="flex gap-2">
              <PrimaryButton onClick={() => exportCsv.mutate()} pending={exportCsv.isPending}>
                Download CSV
              </PrimaryButton>
              <PrimaryButton variant="outline" onClick={() => exportSheets.mutate()} pending={exportSheets.isPending}>
                Export to Google Sheets
              </PrimaryButton>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">You can view totals but cannot export.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
