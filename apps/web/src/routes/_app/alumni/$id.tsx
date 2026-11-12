import { EmploymentPanel } from "@/components/alumni/employment-panel";
import { EvidencePanel } from "@/components/alumni/evidence-panel";
import { ContactsPanel } from "@/components/alumni/contacts-panel";
import { useProgramOptions } from "@/lib/academic-options";
import { Card, CardContent, CardHeader, CardTitle } from "@Alumni-Tracking-Ss/ui/components/card";
import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
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
import { FormField, PrimaryButton } from "@/components/forms/form-layout";
import { PageHeader, PageShell } from "@/components/layout/page";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { StatusBadge } from "@/components/data/status-badge";
import { can, managesFaculty, useSession } from "@/lib/session";
import { client, api, downloadPdf, queryClient } from "@/lib/api";
import { DetailRow, SummaryCard } from "@/components/account/summary-card";
import { AccountAvatar } from "@/components/account/account-avatar";
import { AlumniPhotoDialog } from "@/components/alumni/alumni-photo-dialog";
import { TrackingTable } from "@/components/alumni/tracking-table";

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
  const [editingDetails, setEditingDetails] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState(false);
  const [trackingPage, setTrackingPage] = useState(1);

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
      setEditingDetails(false);
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
      setTrackingPage(1);
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
        leading={
          <AccountAvatar
            image={record.photoUrl}
            name={formatDisplayName(record)}
            className="size-16 sm:size-20"
          />
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={record.isTracked ? "tracked" : "untracked"} />
            {record.canManagePhoto ? (
              <QuietButton onClick={() => setEditingPhoto(true)}>Change photo</QuietButton>
            ) : null}
            {can(session.data?.permissions, "reports.export") ? (
              <QuietButton
                onClick={() =>
                  void downloadPdf(`/reports/alumni/${id}/profile.pdf`).catch((error: Error) =>
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
      <SummaryCard
        title="Student details"
        actionLabel={canWrite ? "Edit details" : undefined}
        onAction={
          canWrite
            ? () => {
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
                setEditingDetails(true);
              }
            : undefined
        }
      >
        <DetailRow label="Full name" value={formatDisplayName(record)} />
        <DetailRow label="Student number" value={record.studentNumber} />
        <DetailRow label="Program" value={`${record.program.code} — ${record.program.name}`} />
        <DetailRow label="Department" value={record.program.department.name} />
        <DetailRow label="Graduation year" value={record.graduationYear ?? "Not recorded"} />
        <DetailRow label="Gender" value={record.gender || "Not recorded"} />
        <DetailRow label="Batch" value={record.batch || "Not recorded"} />
        <DetailRow label="Employment" value={record.employmentStatus} />
      </SummaryCard>

      {editingPhoto ? (
        <AlumniPhotoDialog
          alumniId={id}
          name={formatDisplayName(record)}
          photoUrl={record.photoUrl}
          onClose={() => setEditingPhoto(false)}
        />
      ) : null}

      {editingDetails ? (
        <FormDialog
          open
          title="Edit student details"
          description="Update the alumni record. Employment status remains derived from job history."
          pending={save.isPending}
          onOpenChange={setEditingDetails}
        >
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
              />
            </FormField>
            <FormField id="middleName" label="Middle name">
              <Input
                id="middleName"
                value={form.middleName}
                onChange={(event) => setForm({ ...form, middleName: event.target.value })}
              />
            </FormField>
            <FormField id="lastName" label="Last name" required>
              <Input
                id="lastName"
                required
                value={form.lastName}
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
              />
            </FormField>
            <FormField id="suffix" label="Suffix">
              <Input
                id="suffix"
                value={form.suffix}
                onChange={(event) => setForm({ ...form, suffix: event.target.value })}
              />
            </FormField>
            <FormField id="gender" label="Gender">
              <FormSelect
                id="gender"
                value={form.gender}
                onValueChange={(selected) => setForm({ ...form, gender: selected })}
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
              />
            </FormField>
            <FormField id="programId" label="Program">
              <FormSelect
                id="programId"
                value={form.programId}
                onValueChange={(selected) => setForm({ ...form, programId: selected })}
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
              />
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
              />
            </FormField>
            {save.error ? (
              <ErrorAlert className="md:col-span-2">{save.error.message}</ErrorAlert>
            ) : null}
            <div className="md:col-span-2">
              <PrimaryButton type="submit" pending={save.isPending}>
                Save student details
              </PrimaryButton>
            </div>
          </form>
        </FormDialog>
      ) : null}

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
          <TrackingTable alumniId={id} page={trackingPage} onPageChange={setTrackingPage} />
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

      <EvidencePanel
        kind="evidence"
        files={record.evidenceFiles}
        jobs={record.employments}
        alumniId={id}
        canUpload={canUpload}
        canDelete={can(session.data?.permissions, "files.delete")}
      />

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
