import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/utils/api";
import { FormCard, PageHeader, PageShell } from "@/components/page-header";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Skeleton } from "@Alumni-Tracking-Ss/ui/components/skeleton";

export const Route = createFileRoute("/_app/statistics")({ component: Statistics });
function Statistics() {
  const result = useQuery(api.me.statistics.queryOptions({ input: {} }));
  const data = result.data;
  return (
    <PageShell>
      <PageHeader
        title="University statistics"
        description="Privacy-safe totals across eligible alumni profiles. These views contain no personal records or exports."
      />
      {result.isPending ? (
        <FormCard title="Graduate tracking totals">
          <div
            role="status"
            className="grid grid-cols-2 gap-5 md:grid-cols-4"
          >
            <span className="sr-only">Loading statistics…</span>
            {["Graduates", "Tracked", "Untracked", "Tracked percentage"].map((label) => (
              <div key={label}>
                <p className="text-sm text-muted-foreground">{label}</p>
                <Skeleton className="mt-2 h-8 w-20" />
              </div>
            ))}
          </div>
        </FormCard>
      ) : result.error ? (
        <p role="alert" className="rounded-lg border p-4 text-sm">
          Statistics could not be loaded.{" "}
          <button className="underline" onClick={() => void result.refetch()}>
            Retry
          </button>
        </p>
      ) : data ? (
        <>
          <p
            role="note"
            className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
          >
            {data.message} Nonzero cohorts smaller than {data.minimumCohort} are withheld.
          </p>
          <FormCard title="Graduate tracking totals">
            {data.totals ? (
              <dl className="grid grid-cols-2 gap-5 md:grid-cols-4 md:divide-x">
                {(
                  [
                    ["Graduates", data.totals.graduates.toLocaleString()],
                    ["Tracked", data.totals.tracked.toLocaleString()],
                    ["Untracked", data.totals.untracked.toLocaleString()],
                    ["Tracked percentage", `${data.totals.percentTracked.toFixed(2)}%`],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="min-w-0 md:pl-5 md:first:pl-0">
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd className="mt-2 text-2xl font-medium tracking-tight tabular-nums">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm">
                Totals withheld for privacy. No individual alumni information is available in this
                view.
              </p>
            )}
          </FormCard>
          <FormCard title="By department">
            <DataTable
              headers={["Department", "Graduates", "Tracked", "% tracked"]}
              isEmpty={!data.byDepartment.length}
              emptyTitle="Department breakdown withheld"
              emptyDescription="A breakdown is available only when every cohort meets the privacy threshold."
            >
              {data.byDepartment.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{d.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.graduates.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.tracked.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.percentTracked.toFixed(2)}%
                  </TableCell>
                </TableRow>
              ))}
            </DataTable>
          </FormCard>
        </>
      ) : null}
    </PageShell>
  );
}
