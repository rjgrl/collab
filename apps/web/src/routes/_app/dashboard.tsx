import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@Alumni-Tracking-Ss/ui/components/card";
import { Skeleton } from "@Alumni-Tracking-Ss/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { PageHeader, PageShell } from "@/components/page-header";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const summary = useQuery(orpc.dashboard.summary.queryOptions({ input: {} }));
  const data = summary.data;

  return (
    <PageShell>
      <PageHeader
        title="Dashboard"
        description="Live graduate counts from alumni records attached to programs and departments."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Graduates" value={data?.graduates} loading={summary.isPending} />
        <StatCard label="Tracked" value={data?.tracked} loading={summary.isPending} />
        <StatCard label="Untracked" value={data?.untracked} loading={summary.isPending} />
        <StatCard
          label="% tracked"
          value={data ? `${data.percentTracked}%` : undefined}
          loading={summary.isPending}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>By department</CardTitle>
          <CardDescription>IT is a department code. Percentage uses tracked ÷ graduates.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            headers={["Code", "Department", "Graduates", "Tracked", "% tracked"]}
            loading={summary.isPending}
            isEmpty={data?.byDepartment.length === 0}
            emptyTitle="No departments found"
            emptyDescription="Add a department to see graduate tracking by group."
          >
            {data?.byDepartment.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.code}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.graduates}</TableCell>
                <TableCell>{row.tracked}</TableCell>
                <TableCell>{row.percentTracked}%</TableCell>
              </TableRow>
            ))}
          </DataTable>
          {data ? (
            <p className="mt-4 text-xs text-muted-foreground">
              {data.formula}. {data.conflictNote}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </PageShell>
  );
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string | number | undefined;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{loading ? <Skeleton className="h-8 w-16" /> : (value ?? "—")}</CardTitle>
      </CardHeader>
    </Card>
  );
}
