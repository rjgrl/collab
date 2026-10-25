import { EmploymentPanel } from "@/components/employment-panel";
import { EvidencePanel } from "@/components/evidence-panel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatDisplayName } from "@Alumni-Tracking-Ss/contracts/names";
import { api } from "@/utils/api";
import { FormCard, PageHeader, PageShell } from "@/components/page-header";

export const Route = createFileRoute("/_app/my-profile")({ component: MyProfile });
function MyProfile() {
  const profile = useQuery(api.me.profile.get.queryOptions());
  return (
    <PageShell>
      <PageHeader
        title="My Profile"
        description="Your university record, employment and supporting documents."
        actions={
          <a className="text-sm underline underline-offset-4" href="#employment">
            Update employment
          </a>
        }
      />
      {profile.isPending ? (
        <p role="status">Loading your profile…</p>
      ) : profile.isError ? (
        <FormCard title="Profile unavailable" description={profile.error.message}>
          <p>
            Ask an administrator to link your account to the correct alumni record. Your account
            email or name does not automatically establish a link.
          </p>
          <button className="mt-3 underline" onClick={() => void profile.refetch()}>
            Try again
          </button>
        </FormCard>
      ) : profile.data ? (
        <>
          <div>
            <FormCard
              title={formatDisplayName(profile.data)}
              description={`${profile.data.studentNumber} · ${profile.data.program.name}`}
            >
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Department</dt>
                  <dd>{profile.data.program.department.name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Graduation year</dt>
                  <dd>{profile.data.graduationYear ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Tracking status</dt>
                  <dd>{profile.data.isTracked ? "Tracked" : "Not yet tracked"}</dd>
                </div>
              </dl>
              <p className="mt-4 text-sm">
                Update personal details in{" "}
                <Link to="/settings" className="underline">
                  Settings &rarr; Account
                </Link>
                .
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                Student number, academic assignments and tracking decisions are maintained by
                authorized university staff.
              </p>
            </FormCard>
          </div>
          <section id="employment" className="scroll-mt-4">
            <EmploymentPanel jobs={profile.data.employments} />
          </section>
          <EvidencePanel
            files={profile.data.evidenceFiles}
            jobs={profile.data.employments}
            photoUrl={profile.data.photoUrl}
          />
        </>
      ) : null}
    </PageShell>
  );
}
