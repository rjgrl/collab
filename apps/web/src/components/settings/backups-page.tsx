"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@Alumni-Tracking-Ss/ui/components/card";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import type { z } from "zod";
import type {
  backupScheduleSchema,
  backupEntrySchema,
} from "@Alumni-Tracking-Ss/contracts/backups";

import { FormField, PrimaryButton } from "@/components/forms/form-layout";
import { FormSelect } from "@/components/forms/form-select";
import { PageHeader, PageShell } from "@/components/layout/page";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { DataTable } from "@/components/data/data-table";
import { StatusBadge } from "@/components/data/status-badge";
import { client, api, queryClient } from "@/lib/api";

type BackupSchedule = z.infer<typeof backupScheduleSchema>;
type BackupEntry = z.infer<typeof backupEntrySchema>;

const WEEKDAYS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

function formatDateLong(date: string): string {
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getStatusTone(status: string): "verified" | "unverified" {
  return status === "succeeded" ? "verified" : "unverified";
}

export function BackupsPage() {
  const overview = useQuery(api.backups.overview.queryOptions());
  const [scheduleForm, setScheduleForm] = useState<BackupSchedule>({
    frequency: "off",
    time: "00:00",
    weekday: 0,
    retention: 7,
  });
  const [restoreDialog, setRestoreDialog] = useState<BackupEntry | null>(null);
  const [restoreCode, setRestoreCode] = useState("");
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [pollInterval, setPollInterval] = useState<number | false>(false);

  // Auto-populate schedule form when data loads
  useEffect(() => {
    if (overview.data?.schedule) {
      setScheduleForm(overview.data.schedule);
    }
  }, [overview.data?.schedule]);

  // Poll restore status while running
  const restoreStatus = useQuery({
    ...api.backups.restoreStatus.queryOptions(),
    refetchInterval: pollInterval,
  });

  // Start polling if restore is running
  useEffect(() => {
    if (overview.data?.restore.status === "running") {
      setPollInterval(2000);
    } else {
      setPollInterval(false);
    }
  }, [overview.data?.restore.status]);

  // Handle session invalidation after restore success
  useEffect(() => {
    if (
      restoreStatus.data?.status === "succeeded" &&
      restoreStatus.data.finishedAt &&
      pollInterval
    ) {
      setPollInterval(false);
      // Session will be invalidated, show message and link to login
    }
  }, [restoreStatus.data?.status, restoreStatus.data?.finishedAt, pollInterval]);

  const saveDateSchedule = useMutation({
    mutationFn: (schedule: BackupSchedule) => client.backups.schedule(schedule),
    onSuccess: async () => {
      toast.success("Backup schedule saved");
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  const backupNow = useMutation({
    mutationFn: () => client.backups.create(),
    onSuccess: async () => {
      toast.success("Backup created and verified");
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  const restore = useMutation({
    mutationFn: (entry: BackupEntry) =>
      client.backups.restore({
        id: entry.backupId,
        confirmation: "RESTORE",
        code: restoreCode,
      }),
    onSuccess: async () => {
      setRestoreDialog(null);
      setRestoreCode("");
      setRestoreConfirmation("");
      setPollInterval(2000);
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  if (!overview.data) {
    return (
      <PageShell>
        <PageHeader title="Backups" />
        <p role="status">Loading backups...</p>
      </PageShell>
    );
  }

  const { configured, running, backups, restore: restoreState, maintenance } = overview.data;
  const isConfigured = configured.encryptionKey && configured.dir && configured.tools;
  const isMaintenance = maintenance || restoreState.status === "running";
  const showRestoreStatus =
    isMaintenance && (restoreStatus.data || restoreState.status === "running");

  const missingConfig = [
    !configured.encryptionKey && "BACKUP_ENCRYPTION_KEY",
    !configured.dir && "BACKUP_DIR",
    !configured.tools && "MONGODB_TOOLS_DIR",
  ].filter(Boolean);

  return (
    <PageShell>
      <PageHeader
        title="Backups"
        description="Encrypted backups of the database and stored files. Restoring replaces all current data."
      />

      {/* Configuration warning */}
      {!isConfigured && (
        <ErrorAlert>
          {`Backups are not configured. Set the following environment variables on the server: ${missingConfig.join(", ")}.`}
        </ErrorAlert>
      )}

      {/* Restore status panel */}
      {showRestoreStatus && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950"
        >
          <p className="text-sm font-medium">
            {restoreState.status === "running"
              ? `Restore in progress: ${restoreState.step || "Starting..."}`
              : restoreStatus.data?.status === "succeeded"
                ? "Restore finished. Everyone, including you, must sign in again."
                : restoreStatus.data?.status === "rolled-back"
                  ? `Restore failed at ${restoreStatus.data.step} and was rolled back to the pre-restore backup.`
                  : `Restore failed at ${restoreStatus.data?.step}. Maintenance mode is still on; check the server.`}
          </p>
          {restoreStatus.data?.status === "succeeded" && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => (window.location.href = "/login")}
            >
              Sign in again
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-6">
        {/* Schedule card */}
        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
            <CardDescription>Set up automatic backups to run at a specific time</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FormField id="frequency" label="Frequency" required>
              <FormSelect
                id="frequency"
                value={scheduleForm.frequency}
                onValueChange={(value) =>
                  setScheduleForm({
                    ...scheduleForm,
                    frequency: value as "off" | "daily" | "weekly",
                  })
                }
                items={[
                  { value: "off", label: "Off" },
                  { value: "daily", label: "Daily" },
                  { value: "weekly", label: "Weekly" },
                ]}
              />
            </FormField>

            {scheduleForm.frequency !== "off" && (
              <>
                <FormField id="time" label="Time (Asia/Manila)" required>
                  <Input
                    id="time"
                    type="time"
                    value={scheduleForm.time}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, time: e.target.value })}
                  />
                </FormField>

                {scheduleForm.frequency === "weekly" && (
                  <FormField id="weekday" label="Day of week" required>
                    <FormSelect
                      id="weekday"
                      value={String(scheduleForm.weekday)}
                      onValueChange={(value) =>
                        setScheduleForm({ ...scheduleForm, weekday: parseInt(value, 10) })
                      }
                      items={WEEKDAYS}
                    />
                  </FormField>
                )}
              </>
            )}

            <FormField id="retention" label="Backups to keep" required>
              <Input
                id="retention"
                type="number"
                min={1}
                max={90}
                value={scheduleForm.retention}
                onChange={(e) =>
                  setScheduleForm({ ...scheduleForm, retention: parseInt(e.target.value, 10) || 1 })
                }
              />
            </FormField>

            <div className="flex gap-2 pt-2">
              <PrimaryButton
                pending={saveDateSchedule.isPending}
                pendingLabel="Saving schedule"
                onClick={() => saveDateSchedule.mutate(scheduleForm)}
                disabled={!isConfigured}
              >
                Save schedule
              </PrimaryButton>
            </div>
          </CardContent>
        </Card>

        {/* Back up now button */}
        <div className="flex gap-2">
          <PrimaryButton
            pending={backupNow.isPending}
            pendingLabel="Backing up"
            onClick={() => backupNow.mutate()}
            disabled={!isConfigured}
          >
            Back up now
          </PrimaryButton>
        </div>

        {/* Backups table */}
        {backups.length > 0 && (
          <DataTable
            label="Backups table"
            headers={["Date", "Type", "Size", "Status", "Created by", "Verified", "Actions"]}
            isEmpty={false}
          >
            {backups.map((entry) => (
              <tr key={entry.backupId}>
                <td className="px-4 py-3">{formatDateLong(entry.createdAt)}</td>
                <td className="px-4 py-3 capitalize">{entry.type}</td>
                <td className="px-4 py-3">{formatBytes(entry.sizeBytes)}</td>
                <td className="px-4 py-3">
                  <StatusBadge
                    tone={getStatusTone(entry.status)}
                    children={entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                  />
                </td>
                <td className="px-4 py-3">{entry.createdBy}</td>
                <td className="px-4 py-3">{entry.verified ? "Yes" : "No"}</td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRestoreDialog(entry)}
                    disabled={entry.status !== "succeeded" || !entry.verified}
                    aria-label={`Restore backup from ${formatDateLong(entry.createdAt)}`}
                  >
                    Restore
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>

      {/* Restore dialog */}
      <FormDialog
        open={restoreDialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRestoreDialog(null);
            setRestoreCode("");
            setRestoreConfirmation("");
          }
        }}
        title="Restore backup"
        pending={restore.isPending}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setRestoreDialog(null);
                setRestoreCode("");
                setRestoreConfirmation("");
              }}
              disabled={restore.isPending}
            >
              Cancel
            </Button>
            <PrimaryButton
              pending={restore.isPending}
              pendingLabel="Restoring"
              onClick={() => restoreDialog && restore.mutate(restoreDialog)}
              disabled={
                restoreCode.length !== 6 || restoreConfirmation !== "RESTORE" || !restoreDialog
              }
              // biome-ignore lint/nursery/noUndefinedElementMatches: <explanation>
              className="destructive"
            >
              Restore this backup
            </PrimaryButton>
          </>
        }
      >
        {restoreDialog && (
          <div className="flex flex-col gap-6">
            {/* Backup summary */}
            <div className="space-y-2 text-sm">
              <p>
                <strong>Date:</strong> {formatDateLong(restoreDialog.createdAt)}
              </p>
              <p>
                <strong>Type:</strong>{" "}
                {restoreDialog.type.charAt(0).toUpperCase() + restoreDialog.type.slice(1)}
              </p>
              {restoreDialog.manifest && (
                <>
                  <p>
                    <strong>App Version:</strong> {restoreDialog.manifest.appVersion}
                    {restoreDialog.manifest.appVersion !== running.appVersion && (
                      <span className="ml-1 text-amber-600">(Current: {running.appVersion})</span>
                    )}
                  </p>
                  <p>
                    <strong>Schema Version:</strong> {restoreDialog.manifest.schemaVersion}
                    {restoreDialog.manifest.schemaVersion !== running.schemaVersion && (
                      <span className="ml-1 text-amber-600">
                        (Current: {running.schemaVersion})
                      </span>
                    )}
                  </p>
                  <p>
                    <strong>Collections:</strong>{" "}
                    {Object.entries(restoreDialog.manifest.collections).reduce(
                      (sum, [, count]) => sum + count,
                      0,
                    )}{" "}
                    documents
                  </p>
                  <p>
                    <strong>Files:</strong> {restoreDialog.manifest.files}
                  </p>
                </>
              )}
            </div>

            {/* Version compatibility warning */}
            {restoreDialog.manifest &&
              restoreDialog.manifest.schemaVersion > running.schemaVersion && (
                <ErrorAlert>
                  This backup needs a newer application version ({restoreDialog.manifest.appVersion}
                  ). Upgrade the application before restoring.
                </ErrorAlert>
              )}

            {/* Encryption key warnings */}
            {restoreDialog.manifest && (
              <>
                {restoreDialog.manifest.keyFingerprints.mfa &&
                  restoreDialog.manifest.keyFingerprints.mfa !== running.keyFingerprints.mfa && (
                    <ErrorAlert>
                      The MFA_ENCRYPTION_KEY has changed since this backup was created. Restore
                      cannot proceed.
                    </ErrorAlert>
                  )}
                {restoreDialog.manifest.keyFingerprints.integration &&
                  restoreDialog.manifest.keyFingerprints.integration !==
                    running.keyFingerprints.integration && (
                    <ErrorAlert>
                      The INTEGRATION_ENCRYPTION_KEY has changed since this backup was created.
                      Restore cannot proceed.
                    </ErrorAlert>
                  )}
              </>
            )}

            {/* What happens explanation */}
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">What will happen:</p>
              <ul className="list-inside list-disc space-y-1">
                <li>A pre-restore backup is made and verified first</li>
                <li>The site enters maintenance mode</li>
                <li>All data and files are replaced with the backup</li>
                <li>Everyone, including you, is signed out</li>
              </ul>
            </div>

            {restore.isError && <ErrorAlert>{(restore.error as Error).message}</ErrorAlert>}

            {/* Authenticator code input */}
            <FormField
              id="restore-code"
              label="Authenticator code"
              required
              error={
                restoreCode.length > 0 && restoreCode.length !== 6
                  ? "Enter a 6-digit code"
                  : undefined
              }
            >
              <Input
                id="restore-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={restoreCode}
                onChange={(e) => setRestoreCode(e.target.value.replace(/\D/g, ""))}
              />
            </FormField>

            {/* Confirmation text input */}
            <FormField
              id="restore-confirmation"
              label="Type RESTORE to confirm"
              required
              error={
                restoreConfirmation.length > 0 && restoreConfirmation !== "RESTORE"
                  ? "Type exactly RESTORE"
                  : undefined
              }
            >
              <Input
                id="restore-confirmation"
                placeholder="RESTORE"
                value={restoreConfirmation}
                onChange={(e) => setRestoreConfirmation(e.target.value)}
                autoComplete="off"
              />
            </FormField>
          </div>
        )}
      </FormDialog>
    </PageShell>
  );
}
