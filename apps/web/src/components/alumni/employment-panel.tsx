import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import {
  employmentOutputSchema,
  selfEmploymentInputSchema,
} from "@Alumni-Tracking-Ss/contracts/alumni";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { Badge } from "@Alumni-Tracking-Ss/ui/components/badge";
import { toast } from "sonner";
import { client, queryClient } from "@/lib/api";
import { FormCard, FormField, PrimaryButton } from "@/components/forms/form-layout";
import { CheckboxRow } from "@/components/forms/checkbox-row";
import { BriefcaseBusiness } from "lucide-react";
import { useConfirm } from "@/components/feedback/confirm-provider";
import { DataTable, TableCell, TableRow } from "@/components/data/data-table";
import { PageControls, usePagedRows } from "@/components/data/page-controls";
import { TimestampConflictAlert } from "@/components/feedback/timestamp-conflict-alert";
import { useTimestampEdit, withTimestampEdit } from "@/lib/timestamp-edit";
import { useSession } from "@/lib/session";

const Muted = ({ children }: { children: string }) => (
  <span className="text-muted-foreground">{children}</span>
);

type Employment = z.infer<typeof employmentOutputSchema>;
const emptyJob = {
  employer: "",
  jobTitle: "",
  industry: "",
  location: "",
  startDate: "",
  endDate: "",
  isCurrent: false,
  notes: "",
};
const dateValue = (date: Date | null | undefined) => (date ? date.toISOString().slice(0, 10) : "");
export function EmploymentPanel({
  jobs,
  alumniId,
  canWrite = true,
}: {
  jobs: Employment[];
  alumniId?: string;
  canWrite?: boolean;
}) {
  const confirmAction = useConfirm();
  const paged = usePagedRows(jobs);
  const [editing, setEditing] = useState<Employment | null | undefined>();
  const [draft, setDraft] = useState(emptyJob);
  const session = useSession();
  // Managed profiles name the alumnus; My Profile edits the signed-in alumnus's own record.
  const ownerId = alumniId ?? session.data?.alumniId ?? null;
  const jobEdit = useTimestampEdit();
  // Each dialog is one timestamped edit; its draft starts from the authorized snapshot.
  async function startEdit(job: Employment | null) {
    if (!ownerId) throw new Error("Your account is not linked to an alumni profile.");
    const started = await jobEdit.begin("employment", [ownerId]);
    const current = job
      ? started.snapshot[0]?.employments?.find((item) => item.id === job.id)
      : null;
    if (job && !current) throw new Error("This job was removed. Reload the profile.");
    setDraft(
      current
        ? {
            employer: current.employer,
            jobTitle: current.jobTitle ?? "",
            industry: current.industry ?? "",
            location: current.location ?? "",
            startDate: dateValue(current.startDate),
            endDate: dateValue(current.endDate),
            isCurrent: current.isCurrent,
            notes: current.notes,
          }
        : emptyJob,
    );
    setEditing(job);
  }
  const open = useMutation({
    mutationFn: startEdit,
    onError: (error) => toast.error(error.message),
  });
  const edit = (job: Employment | null) => open.mutate(job);
  const close = () => {
    setEditing(undefined);
    jobEdit.reset();
    save.reset();
  };
  const save = useMutation({
    mutationFn: async () => {
      const data = selfEmploymentInputSchema.parse({
        ...draft,
        startDate: draft.startDate ? `${draft.startDate}T00:00:00Z` : undefined,
        endDate: draft.endDate ? `${draft.endDate}T00:00:00Z` : undefined,
      });
      const options = jobEdit.options;
      if (editing)
        return alumniId
          ? client.alumni.updateEmployment({ ...data, id: editing.id }, options)
          : client.me.employment.update({ ...data, id: editing.id }, options);
      return alumniId
        ? client.alumni.addEmployment({ ...data, alumniId }, options)
        : client.me.employment.create(data, options);
    },
    onSuccess: async () => {
      setEditing(undefined);
      jobEdit.reset();
      toast.success("Employment saved");
      await queryClient.invalidateQueries();
    },
    onError: (error) => {
      jobEdit.handle(error);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => {
      if (!ownerId) throw new Error("Your account is not linked to an alumni profile.");
      return withTimestampEdit("employment", [ownerId], (options) =>
        alumniId
          ? client.alumni.deleteEmployment({ id }, options)
          : client.me.employment.remove({ id }, options),
      );
    },
    onSuccess: async () => {
      toast.success("Employment removed");
      await queryClient.invalidateQueries();
    },
  });
  return (
    <FormCard title="Employment" description="Keep your job history current.">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {jobs.length} {jobs.length === 1 ? "job" : "jobs"} recorded
        </p>
        {canWrite ? (
          <Button size="sm" disabled={open.isPending} onClick={() => edit(null)}>
            Add Employment
          </Button>
        ) : null}
      </div>
      {jobs.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/20 p-5">
          <BriefcaseBusiness
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
          />
          <div>
            <p className="text-sm font-medium">No employment recorded</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your current job or previous experience.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <DataTable
            label="Employment History"
            headers={[
              "Employer",
              "Position",
              "Industry / Location",
              "Period",
              ...(canWrite ? ["Actions"] : []),
            ]}
          >
            {paged.rows.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="min-w-40">
                  <span className="break-words font-medium">{job.employer}</span>
                  {job.isCurrent ? (
                    <Badge variant="secondary" className="ml-2 align-middle font-medium">
                      Current
                    </Badge>
                  ) : null}
                  {job.notes ? (
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {job.notes}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell>{job.jobTitle || <Muted>Not recorded</Muted>}</TableCell>
                <TableCell>
                  {[job.industry, job.location].filter(Boolean).join(" · ") || (
                    <Muted>Not recorded</Muted>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {dateValue(job.startDate) || "—"} –{" "}
                  {job.isCurrent ? "Present" : dateValue(job.endDate) || "—"}
                </TableCell>
                {canWrite ? (
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={open.isPending}
                        onClick={() => edit(job)}
                      >
                        Edit<span className="sr-only"> {job.employer}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={remove.isPending}
                        onClick={async () => {
                          if (
                            await confirmAction({
                              title: `Remove Employment at ${job.employer}?`,
                              description:
                                "This removes the job history entry; attached evidence stays on the profile.",
                              confirmLabel: "Remove",
                              destructive: true,
                            })
                          )
                            remove.mutate(job.id);
                        }}
                      >
                        Remove<span className="sr-only"> {job.employer}</span>
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </DataTable>
          <PageControls
            label="Employment Pages"
            page={paged.page}
            pageSize={paged.pageSize}
            total={paged.total}
            onPage={paged.setPage}
            onPageSize={paged.setPageSize}
          />
        </div>
      )}
      {remove.error ? (
        <p role="alert" className="text-sm text-destructive">
          {remove.error.message}
        </p>
      ) : null}
      {editing !== undefined ? (
        <FormDialog
          open
          title={editing ? "Edit Employment" : "Add Employment"}
          pending={save.isPending}
          onOpenChange={(isOpen) => {
            if (!isOpen) close();
          }}
          footer={
            <div className="flex gap-2">
              <PrimaryButton
                type="submit"
                form="employment-form"
                pending={save.isPending}
                disabled={jobEdit.conflict}
              >
                Save Employment
              </PrimaryButton>
              <Button variant="outline" disabled={save.isPending} onClick={close}>
                Cancel
              </Button>
            </div>
          }
        >
          <form
            id="employment-form"
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            {(
              [
                ["employer", "Employer"],
                ["jobTitle", "Position"],
                ["industry", "Industry"],
                ["location", "Location"],
              ] as const
            ).map(([key, label]) => (
              <FormField key={key} id={`job-${key}`} label={label} required={key === "employer"}>
                <Input
                  id={`job-${key}`}
                  maxLength={160}
                  required={key === "employer"}
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              </FormField>
            ))}
            <FormField id="job-start" label="Start Date">
              <Input
                id="job-start"
                type="date"
                value={draft.startDate}
                onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
              />
            </FormField>
            <FormField id="job-end" label="End Date">
              <Input
                id="job-end"
                type="date"
                value={draft.endDate}
                disabled={draft.isCurrent}
                onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
              />
            </FormField>
            <div className="sm:col-span-2">
              <CheckboxRow
                checked={draft.isCurrent}
                onCheckedChange={(value) =>
                  setDraft({ ...draft, isCurrent: value, endDate: value ? "" : draft.endDate })
                }
              >
                This is my current job
              </CheckboxRow>
              <p className="mt-1 text-xs text-muted-foreground">
                Only one current job is allowed. Selecting this job retires the previous current
                entry.
              </p>
            </div>
            <div className="sm:col-span-2">
              <FormField id="job-notes" label="Notes (Optional)">
                <Input
                  id="job-notes"
                  maxLength={2000}
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                />
              </FormField>
            </div>
            {jobEdit.conflict ? (
              <div className="sm:col-span-2">
                <TimestampConflictAlert
                  onReload={async () => {
                    save.reset();
                    await queryClient.invalidateQueries();
                    await startEdit(editing ?? null).catch((error: Error) => {
                      toast.error(error.message);
                      close();
                    });
                  }}
                />
              </div>
            ) : save.error ? (
              <p role="alert" className="text-sm text-destructive sm:col-span-2">
                {save.error.message}
              </p>
            ) : null}
          </form>
        </FormDialog>
      ) : null}
    </FormCard>
  );
}
