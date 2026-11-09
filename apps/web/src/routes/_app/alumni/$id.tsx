import { EmploymentPanel } from "@/components/alumni/employment-panel";
import { EvidencePanel } from "@/components/alumni/evidence-panel";
import { ContactsPanel } from "@/components/alumni/contacts-panel";
import { useProgramOptions } from "@/lib/academic-options";
import { Card, CardContent, CardHeader, CardTitle } from "@Alumni-Tracking-Ss/ui/components/card";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { Textarea } from "@Alumni-Tracking-Ss/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { formatDisplayName } from "@Alumni-Tracking-Ss/contracts/names";
import { QuietButton } from "@/components/data/data-table";
import Loader from "@/components/layout/loader";
import { FormSelect } from "@/components/forms/form-select";
import { FormActions, FormField, PrimaryButton } from "@/components/forms/form-layout";
import { PageHeader, PageShell } from "@/components/layout/page";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { StatusBadge } from "@/components/data/status-badge";
import { can, managesFaculty, useSession } from "@/lib/session";
import { client, api, downloadPdf, queryClient } from "@/lib/api";

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
    firstName: "",
    middleName: "",
    lastName: "",
    suffix: "",
    gender: "",
    batch: "",
    studentNumber: "",
    graduationYear: "",
    programId: "",
  });
  const showHistory = managesFaculty(session.data);
  const history = useQuery({
    ...api.alumni.history.queryOptions({ input: { id } }),
    enabled: showHistory,
  });
  const [trackingNotes, setTrackingNotes] = useState("");

  useEffect(() => {
    if (!record) {
      return;
    }
    setForm({
      firstName: record.firstName,
      middleName: record.middleName ?? "",
      lastName: record.lastName,
      suffix: record.suffix ?? "",
      gender: record.gender ?? "",
      batch: record.batch ?? "",
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
        gender: form.gender === "Male" || form.gender === "Female" ? form.gender : undefined,
        graduationYear: Number(form.graduationYear),
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
        {alumni.isError ? (
          <ErrorAlert onRetry={() => void alumni.refetch()}>{alumni.error.message}</ErrorAlert>
        ) : null}
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
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={record.isTracked ? "tracked" : "untracked"} />
            {can(session.data?.permissions, "reports.export") ? (
              <QuietButton
                onClick={() =>
                  void downloadPdf(`/api/reports/alumni/${id}/profile.pdf`).catch((error: Error) =>
                    toast.error(error.message),
                  )
                }
              >
                Profile PDF
              </QuietButton>
            ) : null}
          </div>
        }
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
            <FormField id="firstName" label="First name" required>
              <Input
                id="firstName"
                required
                value={form.firstName}
                onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                disabled={!canWrite}
              />
            </FormField>
            <FormField id="middleName" label="Middle name">
              <Input
                id="middleName"
                value={form.middleName}
                onChange={(event) => setForm({ ...form, middleName: event.target.value })}
                disabled={!canWrite}
              />
            </FormField>
            <FormField id="lastName" label="Last name" required>
              <Input
                id="lastName"
                required
                value={form.lastName}
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                disabled={!canWrite}
              />
            </FormField>
            <FormField id="suffix" label="Suffix">
              <Input
                id="suffix"
                value={form.suffix}
                onChange={(event) => setForm({ ...form, suffix: event.target.value })}
                disabled={!canWrite}
              />
            </FormField>
            <FormField id="gender" label="Gender">
              <FormSelect
                id="gender"
                value={form.gender}
                onValueChange={(selected) => setForm({ ...form, gender: selected })}
                disabled={!canWrite}
                items={[
                  { value: "", label: "Not specified" },
                  { value: "Female", label: "Female" },
                  { value: "Male", label: "Male" },
                ]}
              />
            </FormField>
            <FormField id="batch" label="Batch">
              <Input
                id="batch"
                maxLength={40}
                value={form.batch}
                onChange={(event) => setForm({ ...form, batch: event.target.value })}
                disabled={!canWrite}
              />
            </FormField>
            <FormField id="programId" label="Program">
              <FormSelect
                id="programId"
                value={form.programId}
                onValueChange={(selected) => setForm({ ...form, programId: selected })}
                disabled={!canWrite}

                items={
                  programs.data?.map((program) => ({
                    value: program.id,
                    label: `${program.department.name} / ${program.code} — ${program.name}`,
                  })) ?? []
                }
              />
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
            <FormField id="graduationYear" label="Graduation year" required>
              <Input
                id="graduationYear"
                type="number"
                required
                min={1950}
                max={2100}
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

      <ContactsPanel alumniId={id} contacts={record.contacts} canWrite={canWrite} />

      <EmploymentPanel jobs={record.employments} alumniId={id} canWrite={canWrite} />

      <Card>
        <CardHeader>
          <CardTitle>Tracking</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">Current status</span>
            <StatusBadge tone={record.isTracked ? "tracked" : "untracked"} />
          </div>
          {record.trackingEvents.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No tracking events found.
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {record.trackingEvents.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:gap-5"
                >
                  <div className="shrink-0 text-xs leading-6 text-muted-foreground sm:w-44">
                    {event.recordedAt ? (
                      <time dateTime={new Date(event.recordedAt).toISOString()}>
                        {new Date(event.recordedAt).toLocaleString()}
                      </time>
                    ) : (
                      "Date not recorded"
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">
                      {event.isTracked ? "Tracked" : "Untracked"}{" "}
                      <span className="font-normal text-muted-foreground">· {event.source}</span>
                    </p>
                    {event.notes ? (
                      <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                        {event.notes}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {canTrack ? (
            <div className="flex flex-col gap-3 border-t pt-4">
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

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <EvidencePanel
          kind="image"
          files={record.evidenceFiles}
          jobs={record.employments}
          alumniId={id}
          photoUrl={record.photoUrl}
          canUpload={canUpload}
          canDelete={can(session.data?.permissions, "files.delete")}
        />
        <EvidencePanel
          kind="evidence"
          files={record.evidenceFiles}
          jobs={record.employments}
          alumniId={id}
          canUpload={canUpload}
          canDelete={can(session.data?.permissions, "files.delete")}
        />
      </div>

      {showHistory ? (
        <Card>
          <CardHeader>
            <CardTitle>Change history</CardTitle>
          </CardHeader>
          <CardContent>
            {history.isError ? (
              <p role="alert" className="text-sm">
                {history.error.message}
              </p>
            ) : !history.data?.length ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                {history.isPending ? "Loading history…" : "No recorded changes."}
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {history.data.map((entry) => (
                  <li key={entry.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                    <p className="text-xs text-muted-foreground">
                      <time dateTime={new Date(entry.createdAt).toISOString()}>
                        {new Date(entry.createdAt).toLocaleString()}
                      </time>{" "}
                      · {entry.actor?.name ?? "System"} · {entry.action}
                    </p>
                    {entry.changes.length ? (
                      <ul className="flex flex-col gap-0.5">
                        {entry.changes.map((change) => (
                          <li key={change.field} className="break-words">
                            <span className="font-medium">{change.field}</span>:{" "}
                            <span className="text-muted-foreground">
                              {JSON.stringify(change.old ?? null)}
                            </span>{" "}
                            → {JSON.stringify(change.new ?? null)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="break-words">{entry.summary}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  );
}
