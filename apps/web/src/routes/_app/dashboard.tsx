import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@Alumni-Tracking-Ss/ui/components/card";
import { Skeleton } from "@Alumni-Tracking-Ss/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { DataTable, QuietButton, TableCell, TableRow } from "@/components/data-table";
import { PageHeader, PageShell } from "@/components/page-header";
import { can, useSession } from "@/lib/session";
import { api } from "@/utils/api";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const session = useSession();
  const summary = useQuery(api.dashboard.summary.queryOptions({ input: {} }));
  const data = summary.data;

  return (
    <PageShell>
      <PageHeader
        title="Dashboard"
        description="Live graduate counts from alumni records attached to programs and departments."
        actions={
          <>
            {can(session.data?.permissions, "alumni.read") ? (
              <QuietButton nativeButton={false} render={<Link to="/alumni" />}>
                View alumni
              </QuietButton>
            ) : null}
            {can(session.data?.permissions, "reports.read") ? (
              <QuietButton nativeButton={false} render={<Link to="/reports" />}>
                View reports
              </QuietButton>
            ) : null}
          </>
        }
      />
      <dl className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card xl:grid-cols-4 [&>div]:border-b [&>div]:border-r [&>div:nth-child(2n)]:border-r-0 [&>div:nth-last-child(-n+2)]:border-b-0 xl:[&>div]:border-b-0 xl:[&>div:nth-child(2)]:border-r">
        <StatCard label="Graduates" value={data?.graduates} loading={summary.isPending} />
        <StatCard label="Tracked" value={data?.tracked} loading={summary.isPending} />
        <StatCard label="Untracked" value={data?.untracked} loading={summary.isPending} />
        <StatCard
          label="% tracked"
          value={data ? `${data.percentTracked.toFixed(2)}%` : undefined}
          loading={summary.isPending}
        />
      </dl>
      <p className="text-sm text-muted-foreground">
        Registered alumni accounts:{" "}
        <span className="font-medium tabular-nums text-foreground">
          {data?.registered?.toLocaleString() ?? "—"}
        </span>
        . Graduate totals count profiles, including unregistered graduates.
      </p>
      {summary.error ? (
        <p role="alert" className="rounded-lg border px-4 py-3 text-sm">
          Could not load dashboard.{" "}
          <QuietButton onClick={() => void summary.refetch()}>Retry</QuietButton>
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>By department</CardTitle>
          <CardDescription>Percentage uses tracked ÷ graduates.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            headers={["Department", "Graduates", "Tracked", "% tracked"]}
            loading={summary.isPending}
            isEmpty={data?.byDepartment.length === 0}
            emptyTitle="No departments found"
            emptyDescription="Add a department to see graduate tracking by group."
          >
            {data?.byDepartment.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.graduates.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.tracked.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.percentTracked.toFixed(2)}%
                </TableCell>
              </TableRow>
            ))}
          </DataTable>
          {data ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Tracked percentage is tracked graduates divided by all eligible graduates, multiplied
              by 100.
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
    <div className="min-w-0 p-4 sm:p-5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-2xl font-medium tracking-tight tabular-nums">
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : typeof value === "number" ? (
          value.toLocaleString()
        ) : (
          (value ?? "—")
        )}
      </dd>
    </div>
  );
}
