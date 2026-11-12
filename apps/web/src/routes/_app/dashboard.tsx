import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@Alumni-Tracking-Ss/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap, Percent, UserCheck, UserX } from "lucide-react";

import { DataTable, QuietButton, TableCell, TableRow } from "@/components/data/data-table";
import { StatGrid, StatTile } from "@/components/data/stat-tile";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { PageHeader, PageShell } from "@/components/layout/page";
import { can, useSession } from "@/lib/session";
import { api } from "@/lib/api";

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
              <Button size="sm" nativeButton={false} render={<Link to="/alumni" />}>
                View alumni
              </Button>
            ) : null}
            {can(session.data?.permissions, "reports.read") ? (
              <QuietButton nativeButton={false} render={<Link to="/reports" />}>
                View reports
              </QuietButton>
            ) : null}
          </>
        }
      />
      <StatGrid>
        <StatTile
          label="Graduates"
          value={data?.graduates}
          loading={summary.isPending}
          icon={GraduationCap}
        />
        <StatTile
          label="Tracked"
          value={data?.tracked}
          loading={summary.isPending}
          icon={UserCheck}
        />
        <StatTile
          label="Untracked"
          value={data?.untracked}
          loading={summary.isPending}
          icon={UserX}
        />
        <StatTile
          label="% tracked"
          value={data ? `${data.percentTracked.toFixed(2)}%` : undefined}
          loading={summary.isPending}
          icon={Percent}
        />
      </StatGrid>
      <p className="text-sm text-muted-foreground">
        Registered alumni accounts:{" "}
        <span className="font-medium tabular-nums text-foreground">
          {data?.registered?.toLocaleString() ?? "—"}
        </span>
        . Graduate totals count profiles, including unregistered graduates.
      </p>
      {summary.error ? (
        <ErrorAlert onRetry={() => void summary.refetch()}>Could not load dashboard.</ErrorAlert>
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
