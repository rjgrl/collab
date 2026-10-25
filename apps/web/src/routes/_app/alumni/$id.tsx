import { EmploymentPanel } from "@/components/employment-panel";
import { EvidencePanel } from "@/components/evidence-panel";
import { useProgramOptions } from "@/lib/academic-options";
import { Card, CardContent, CardHeader, CardTitle } from "@Alumni-Tracking-Ss/ui/components/card";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { Textarea } from "@Alumni-Tracking-Ss/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { formatDisplayName } from "@Alumni-Tracking-Ss/contracts/names";
import { QuietButton } from "@/components/data-table";
import Loader from "@/components/loader";
import { NativeSelect } from "@/components/native-select";
import {
  FormActions,
  FormField,
  PageHeader,
  PageShell,
  PrimaryButton,
} from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { can, useSession } from "@/lib/session";
import { client, api, queryClient } from "@/utils/api";

export const Route = createFileRoute("/_app/alumni/$id")({
  component: AlumniDetailPage,
});

function AlumniDetailPage() {
  const { id } = Route.useParams();
  const session = useSession();
  const programs = useProgramOptions();
  const alumni = useQuery(api.alumni.get.queryOptions({ input: { id } }));
  const record = alumni.data;
  const [form, setForm] = useState({
    studentNumber: "",
    graduationYear: "",
    programId: "",
  });
  const [trackingNotes, setTrackingNotes] = useState("");

  useEffect(() => {
    if (!record) {
      return;
    }
    setForm({
      studentNumber: record.studentNumber,
      graduationYear: record.graduationYear ? String(record.graduationYear) : "",
      programId: record.programId,
    });
  }, [record]);

  const save = useMutation({
    mutationFn: () =>
      client.alumni.update({
        id,
        ...form,
        graduationYear: form.graduationYear ? Number(form.graduationYear) : undefined,
      }),
    onSuccess: async () => {
      toast.success("Alumni profile saved");
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  const track = useMutation({
    mutationFn: (isTracked: boolean) =>
      client.alumni.addTracking({
        alumniId: id,
        isTracked,
        notes: trackingNotes,
        source: "manual",
      }),
    onSuccess: async () => {
      toast.success("Tracking updated");
      setTrackingNotes("");
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  if (alumni.isPending) {
    return (
      <PageShell>
        <Loader />
      </PageShell>
    );
  }

  if (!record) {
    return (
      <PageShell>
        <PageHeader title="Alumni profile" description="This alumni record could not be found." />
      </PageShell>
    );
  }

  const canWrite = can(session.data?.permissions, "alumni.write");
  const canTrack = can(session.data?.permissions, "tracking.write");
  const canUpload = can(session.data?.permissions, "files.write");

  return (
    <PageShell>
      <PageHeader
        title={formatDisplayName(record)}
        description={`${record.program.department.name} / ${record.program.code}`}
        actions={<StatusBadge tone={record.isTracked ? "tracked" : "untracked"} />}
      />
      <Card>
        <CardHeader>
          <CardTitle>Student details</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <FormField id="programId" label="Program">
              <NativeSelect
                id="programId"
                value={form.programId}
                onChange={(event) => setForm({ ...form, programId: event.target.value })}
                disabled={!canWrite}
              >
                {programs.data?.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.department.name} / {program.code} — {program.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="studentNumber" label="Student number">
              <Input
                id="studentNumber"
                value={form.studentNumber}
                onChange={(event) => setForm({ ...form, studentNumber: event.target.value })}
                disabled={!canWrite}
              />
            </FormField>
            <FormField id="employmentStatus" label="Employment status (derived from job history)">
              <Input id="employmentStatus" value={record.employmentStatus} readOnly />
            </FormField>
            <FormField id="graduationYear" label="Graduation year">
              <Input
                id="graduationYear"
                type="number"
                value={form.graduationYear}
                onChange={(event) => setForm({ ...form, graduationYear: event.target.value })}
                disabled={!canWrite}
              />
            </FormField>
            {canWrite ? (
              <FormActions>
                <PrimaryButton type="submit" pending={save.isPending}>
                  Save
                </PrimaryButton>
              </FormActions>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <EmploymentPanel jobs={record.employments} alumniId={id} canWrite={canWrite} />

      <Card>
        <CardHeader>
          <CardTitle>Tracking</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Current status</span>
            <StatusBadge tone={record.isTracked ? "tracked" : "untracked"} />
          </div>
          {record.trackingEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tracking events found.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {record.trackingEvents.map((event) => (
                <li key={event.id}>
                  {event.recordedAt
                    ? new Date(event.recordedAt).toLocaleString()
                    : "Date not recorded"}{" "}
                  · {event.isTracked ? "Tracked" : "Untracked"} · {event.source}
                  {event.notes ? ` · ${event.notes}` : ""}
                </li>
              ))}
            </ul>
          )}
          {canTrack ? (
            <div className="flex flex-col gap-2">
              <Textarea
                value={trackingNotes}
                onChange={(event) => setTrackingNotes(event.target.value)}
                placeholder="Tracking notes"
                aria-label="Tracking notes"
              />
              <div className="flex flex-wrap gap-2">
                <PrimaryButton onClick={() => track.mutate(true)} pending={track.isPending}>
                  Mark tracked
                </PrimaryButton>
                <QuietButton onClick={() => track.mutate(false)}>Mark untracked</QuietButton>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <EvidencePanel
        files={record.evidenceFiles}
        jobs={record.employments}
        alumniId={id}
        photoUrl={record.photoUrl}
        canUpload={canUpload}
        canDelete={can(session.data?.permissions, "files.delete")}
      />
    </PageShell>
  );
}
