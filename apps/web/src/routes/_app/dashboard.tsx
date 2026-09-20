import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@Alumni-Tracking-Ss/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const summary = useQuery(orpc.dashboard.summary.queryOptions({ input: {} }));
  const data = summary.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Graduate tracking"
        description="Live counts from alumni records attached to programs and departments."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Graduates" value={data?.graduates} />
        <StatCard label="Tracked" value={data?.tracked} />
        <StatCard label="Untracked" value={data?.untracked} />
        <StatCard label="% tracked" value={data ? `${data.percentTracked}%` : undefined} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>By department</CardTitle>
          <CardDescription>
            IT is treated as a department code. Percentage uses tracked ÷ graduates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">Code</th>
                  <th className="py-2 font-medium">Department</th>
                  <th className="py-2 font-medium">Graduates</th>
                  <th className="py-2 font-medium">Tracked</th>
                  <th className="py-2 font-medium">% tracked</th>
                </tr>
              </thead>
              <tbody>
                {data?.byDepartment.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="py-2">{row.code}</td>
                    <td className="py-2">{row.name}</td>
                    <td className="py-2">{row.graduates}</td>
                    <td className="py-2">{row.tracked}</td>
                    <td className="py-2">{row.percentTracked}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {data?.formula}. {data?.conflictNote}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value ?? "—"}</CardTitle>
      </CardHeader>
    </Card>
  );
}
