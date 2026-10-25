import { EmploymentPanel } from "@/components/employment-panel";
import { EvidencePanel } from "@/components/evidence-panel";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatDisplayName } from "@Alumni-Tracking-Ss/contracts/names";
import { api } from "@/utils/api";
import { FormCard, PageHeader, PageShell } from "@/components/page-header";
import { QuietButton } from "@/components/data-table";
import { Skeleton } from "@Alumni-Tracking-Ss/ui/components/skeleton";
import { StatusBadge } from "@/components/status-badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@Alumni-Tracking-Ss/ui/components/card";
import { BriefcaseBusiness, FileCheck2 } from "lucide-react";
import { AccountAvatar } from "@/components/account-avatar";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_app/my-profile")({ component: MyProfile });
function MyProfile() {
  const session = useSession();
  const profile = useQuery(api.me.profile.get.queryOptions());
  return (
    <PageShell>
      <PageHeader
        title="My Profile"
        description="Your academic record, employment history and supporting evidence."
        actions={
          <>
            <QuietButton nativeButton={false} render={<a href="#employment" />}>
              <BriefcaseBusiness aria-hidden="true" className="size-4" /> Employment
            </QuietButton>
            <QuietButton nativeButton={false} render={<a href="#supporting-evidence" />}>
              <FileCheck2 aria-hidden="true" className="size-4" /> Evidence
            </QuietButton>
          </>
        }
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
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Tracking status</span>
                  <StatusBadge tone={profile.data.isTracked ? "tracked" : "untracked"}>
                    {profile.data.isTracked ? "Tracked" : "Not yet tracked"}
                  </StatusBadge>
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
                Academic records and tracking decisions are maintained by authorized university
                staff.
              </p>
            </CardContent>
          </Card>
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section
              id="employment"
              aria-label="Employment history"
              className="min-w-0 scroll-mt-4"
            >
              <EmploymentPanel jobs={profile.data.employments} />
            </section>
            <section
              id="supporting-evidence"
              aria-label="Supporting evidence"
              className="min-w-0 scroll-mt-4"
            >
              <EvidencePanel
                kind="evidence"
                files={profile.data.evidenceFiles}
                jobs={profile.data.employments}
              />
            </section>
          </div>
        </>
      ) : null}
    </PageShell>
  );
}
