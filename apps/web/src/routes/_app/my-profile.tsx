import { EmploymentPanel } from "@/components/alumni/employment-panel";
import { EvidencePanel } from "@/components/alumni/evidence-panel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatDisplayName } from "@Alumni-Tracking-Ss/contracts/names";
import { api } from "@/lib/api";
import { FormCard } from "@/components/forms/form-layout";
import { PageHeader, PageShell } from "@/components/layout/page";
import { SectionTabs, sectionTabClass, useSectionTab } from "@/components/layout/section-tabs";
import { QuietButton } from "@/components/data/data-table";
import { Skeleton } from "@Alumni-Tracking-Ss/ui/components/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@Alumni-Tracking-Ss/ui/components/card";
import { AccountAvatar } from "@/components/account/account-avatar";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_app/my-profile")({
  // Types the tab links; useSectionTab reads and corrects the address itself.
  validateSearch: (search: Record<string, unknown>): { tab?: "evidence" } =>
    typeof search.tab === "string" ? { tab: search.tab as "evidence" } : {},
  component: MyProfile,
});
function MyProfile() {
  const session = useSession();
  // Employment is the default and adds nothing to the address.
  const tab = useSectionTab(["employment", "evidence"] as const);
  const profile = useQuery(api.me.profile.get.queryOptions());
  return (
    <PageShell>
      <PageHeader
        title="My profile"
        description="Your academic record, employment history and supporting evidence."
      />
      {profile.isPending ? (
        <div role="status" className="rounded-xl border bg-card p-5">
          <span className="sr-only">Loading your profile…</span>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-3 h-4 w-64 max-w-full" />
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-14 w-full" />
            ))}
          </div>
        </div>
      ) : profile.isError ? (
        <FormCard title="Profile unavailable" description={profile.error.message}>
          <p>
            Ask an administrator to link your account to the correct alumni record. Your account
            email or name does not automatically establish a link.
          </p>
          <QuietButton className="mt-3" onClick={() => void profile.refetch()}>
            Try again
          </QuietButton>
        </FormCard>
      ) : profile.data ? (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <AccountAvatar
                    image={session.data?.image ?? profile.data.photoUrl}
                    name={formatDisplayName(profile.data)}
                    className="size-14 rounded-xl"
                  />
                  <div className="min-w-0">
                    <CardTitle className="break-words text-lg">
                      {formatDisplayName(profile.data)}
                    </CardTitle>
                    <CardDescription className="mt-1 break-words">
                      {profile.data.program.name}
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-5 border-t pt-5 text-sm sm:grid-cols-3">
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Student number</dt>
                  <dd className="mt-1 break-words font-medium tabular-nums">
                    {profile.data.studentNumber}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Department</dt>
                  <dd className="mt-1 break-words font-medium">
                    {profile.data.program.department.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Graduation year</dt>
                  <dd className="mt-1 font-medium tabular-nums">
                    {profile.data.graduationYear ?? "Not recorded"}
                  </dd>
                </div>
              </dl>
              <p className="mt-5 max-w-3xl text-xs leading-5 text-muted-foreground">
                Academic records are maintained by authorized university staff.
              </p>
            </CardContent>
          </Card>
          <SectionTabs label="Profile sections">
            <Link
              to="/my-profile"
              search={{}}
              resetScroll={false}
              activeOptions={{ exact: true, includeSearch: true }}
              aria-current={tab === "employment" ? "page" : undefined}
              className={sectionTabClass}
            >
              Employment
            </Link>
            <Link
              to="/my-profile"
              search={{ tab: "evidence" }}
              resetScroll={false}
              activeOptions={{ exact: true, includeSearch: true }}
              aria-current={tab === "evidence" ? "page" : undefined}
              className={sectionTabClass}
            >
              Evidence
            </Link>
          </SectionTabs>
          {tab === "employment" ? (
            <EmploymentPanel jobs={profile.data.employments} />
          ) : (
            <EvidencePanel
              kind="evidence"
              files={profile.data.evidenceFiles}
              jobs={profile.data.employments}
            />
          )}
        </>
      ) : null}
    </PageShell>
  );
}
