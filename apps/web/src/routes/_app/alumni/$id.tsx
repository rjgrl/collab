import { Card, CardContent, CardHeader, CardTitle } from "@Alumni-Tracking-Ss/ui/components/card";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { Textarea } from "@Alumni-Tracking-Ss/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { QuietButton } from "@/components/data-table";
import Loader from "@/components/loader";
import { NativeSelect } from "@/components/native-select";
import { FormActions, FormField, PageHeader, PageShell, PrimaryButton } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { can, useSession } from "@/lib/session";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_app/alumni/$id")({
  component: AlumniDetailPage,
});

function AlumniDetailPage() {
  const { id } = Route.useParams();
  const session = useSession();
  const programs = useQuery(orpc.programs.list.queryOptions({ input: {} }));
  const alumni = useQuery(orpc.alumni.get.queryOptions({ input: { id } }));
  const record = alumni.data;
  const [form, setForm] = useState({
    studentNumber: "",
    firstName: "",
    lastName: "",
    middleName: "",
    gender: "",
    graduationYear: "",
    batch: "",
    mobileNumber: "",
    personalEmail: "",
    facebookAccount: "",
    programId: "",
    employmentStatus: "unknown" as "employed" | "unemployed" | "unknown",
  });
  const [job, setJob] = useState({ employer: "", jobTitle: "", notes: "" });
  const [trackingNotes, setTrackingNotes] = useState("");

  useEffect(() => {
    if (!record) {
      return;
    }
    setForm({
      studentNumber: record.studentNumber,
      firstName: record.firstName,
      lastName: record.lastName,
      middleName: record.middleName ?? "",
      gender: record.gender ?? "",
      graduationYear: record.graduationYear ? String(record.graduationYear) : "",
      batch: record.batch ?? "",
      mobileNumber: record.mobileNumber ?? "",
      personalEmail: record.personalEmail ?? "",
      facebookAccount: record.facebookAccount ?? "",
      programId: record.programId,
      employmentStatus: record.employmentStatus,
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

  const addJob = useMutation({
    mutationFn: () =>
      client.alumni.addEmployment({
        alumniId: id,
        employer: job.employer,
        jobTitle: job.jobTitle,
        notes: job.notes,
        isCurrent: true,
        status: "employed",
      }),
    onSuccess: async () => {
      toast.success("Employment added");
      setJob({ employer: "", jobTitle: "", notes: "" });
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

  async function uploadFile(file: File, kind: string) {
    const body = new FormData();
    body.set("alumniId", id);
    body.set("kind", kind);
    body.set("file", file);
    const response = await fetch("/api/files/evidence", {
      method: "POST",
      credentials: "include",
      body,
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error || "Upload failed");
    }
    await queryClient.invalidateQueries();
    toast.success("File uploaded");
  }

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
        title={`${record.lastName}, ${record.firstName}`}
        description={`${record.program.department.code} / ${record.program.code}`}
        actions={<StatusBadge tone={record.isTracked ? "tracked" : "untracked"} />}
      />
      <Card>
        <CardHeader>
          <CardTitle>Student details and contact info</CardTitle>
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
                    {program.department.code} / {program.code} — {program.name}
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
            <FormField id="firstName" label="First name">
              <Input
                id="firstName"
                value={form.firstName}
                onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                disabled={!canWrite}
              />
            </FormField>
            <FormField id="lastName" label="Last name">
              <Input
                id="lastName"
                value={form.lastName}
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
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
            <FormField id="gender" label="Gender">
              <Input
                id="gender"
                value={form.gender}
                onChange={(event) => setForm({ ...form, gender: event.target.value })}
                disabled={!canWrite}
              />
            </FormField>
            <FormField id="batch" label="Batch">
              <Input
                id="batch"
                value={form.batch}
                onChange={(event) => setForm({ ...form, batch: event.target.value })}
                disabled={!canWrite}
              />
            </FormField>
            <FormField id="employmentStatus" label="Employment status">
              <NativeSelect
                id="employmentStatus"
                value={form.employmentStatus}
                onChange={(event) =>
                  setForm({
                    ...form,
                    employmentStatus: event.target.value as typeof form.employmentStatus,
                  })
                }
                disabled={!canWrite}
              >
                <option value="unknown">Unknown</option>
                <option value="employed">Employed</option>
                <option value="unemployed">Unemployed</option>
              </NativeSelect>
            </FormField>
            <FormField id="mobileNumber" label="Mobile #">
              <Input
                id="mobileNumber"
                value={form.mobileNumber}
                onChange={(event) => setForm({ ...form, mobileNumber: event.target.value })}
                disabled={!canWrite}
              />
            </FormField>
            <FormField id="personalEmail" label="Personal email">
              <Input
                id="personalEmail"
                type="email"
                value={form.personalEmail}
                onChange={(event) => setForm({ ...form, personalEmail: event.target.value })}
                disabled={!canWrite}
              />
            </FormField>
            <FormField id="facebookAccount" label="Facebook account">
              <Input
                id="facebookAccount"
                value={form.facebookAccount}
                onChange={(event) => setForm({ ...form, facebookAccount: event.target.value })}
                disabled={!canWrite}
              />
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

      <Card>
        <CardHeader>
          <CardTitle>Employment</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {record.employments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No employment records found.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {record.employments.map((item) => (
                <li key={item.id} className="border-b pb-2 last:border-0">
                  <strong>{item.employer}</strong>
                  {item.jobTitle ? ` · ${item.jobTitle}` : ""}
                  {item.isCurrent ? " · current" : ""}
                </li>
              ))}
            </ul>
          )}
          {canWrite ? (
            <form
              className="grid gap-3 md:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                addJob.mutate();
              }}
            >
              <Input
                placeholder="Employer"
                value={job.employer}
                onChange={(event) => setJob({ ...job, employer: event.target.value })}
                required
                aria-label="Employer"
              />
              <Input
                placeholder="Job title"
                value={job.jobTitle}
                onChange={(event) => setJob({ ...job, jobTitle: event.target.value })}
                aria-label="Job title"
              />
              <PrimaryButton type="submit" pending={addJob.isPending} pendingLabel="Adding">
                Add employment
              </PrimaryButton>
            </form>
          ) : null}
        </CardContent>
      </Card>

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
                  {new Date(event.recordedAt).toLocaleString()} · {event.isTracked ? "Tracked" : "Untracked"} ·{" "}
                  {event.source}
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

      <Card>
        <CardHeader>
          <CardTitle>Evidence and images</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {record.evidenceFiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No files uploaded.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {record.evidenceFiles.map((file) => (
                <li key={file.id}>
                  <a className="underline underline-offset-4" href={`/api/files/${file.id}`} target="_blank" rel="noreferrer">
                    {file.originalName}
                  </a>{" "}
                  · {file.provider} · {file.kind}
                </li>
              ))}
            </ul>
          )}
          {canUpload ? (
            <div className="grid gap-4 md:grid-cols-2">
              <FormField id="evidence" label="Upload evidence">
                <Input
                  id="evidence"
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadFile(file, "evidence").catch((error) => toast.error(error.message));
                  }}
                />
              </FormField>
              <FormField id="image" label="Upload image">
                <Input
                  id="image"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadFile(file, "image").catch((error) => toast.error(error.message));
                  }}
                />
              </FormField>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </PageShell>
  );
}
