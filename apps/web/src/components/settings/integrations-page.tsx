import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@Alumni-Tracking-Ss/ui/components/card";
import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { Textarea } from "@Alumni-Tracking-Ss/ui/components/textarea";
import {
  INTEGRATION_CREDENTIAL_FIELDS,
  INTEGRATION_NAMES,
  credentialFormatError,
  credentialsError,
  fieldRequired,
  type CredentialField,
  type IntegrationKey,
} from "@Alumni-Tracking-Ss/contracts/integration-credentials";
import { isAdministrator } from "@Alumni-Tracking-Ss/contracts/names";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, PrimaryButton } from "@/components/forms/form-layout";
import { FormSelect } from "@/components/forms/form-select";
import { PageHeader, PageShell } from "@/components/layout/page";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { useConfirm } from "@/components/feedback/confirm-provider";
import { can, useSession } from "@/lib/session";
import { client, api, queryClient } from "@/lib/api";
import { StatusBadge } from "@/components/data/status-badge";

type Integration = Awaited<ReturnType<typeof client.integrations.list>>[number];
type DialogState = { key: IntegrationKey; mode: "enable" | "update" };

const CREDENTIAL_WARNINGS: Partial<Record<Integration["credentialStatus"], string>> = {
  mismatch:
    "Saved credentials can't be read with this server's encryption key. Disable and enable it again to re-enter them.",
  unreadable:
    "Saved credentials can't be read with this server's encryption key. Disable and enable it again to re-enter them.",
  no_key: "Set INTEGRATION_ENCRYPTION_KEY on the server before saving credentials.",
};

function secretLabel(field: Integration["fields"][number]) {
  if (!field.set) return "Not set";
  return field.hint && field.hint.length === 4 && field.hint !== "json"
    ? `Set · ends in ••••${field.hint}`
    : "Set";
}

export function IntegrationsPage() {
  const session = useSession();
  const confirm = useConfirm();
  const list = useQuery(api.integrations.list.queryOptions());
  const canWrite = can(session.data?.permissions, "integrations.write");
  const canManage = Boolean(session.data && isAdministrator(session.data) && canWrite);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [csv, setCsv] = useState(
    "studentNumber,firstName,lastName,gender,departmentName,programCode,personalEmail,isTracked\n",
  );
  const [testEmail, setTestEmail] = useState("");

  const disable = useMutation({
    mutationFn: (key: IntegrationKey) => client.integrations.disable({ key }),
    onSuccess: async (_result, key) => {
      toast.success(`${INTEGRATION_NAMES[key]} disabled`);
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });
  const regenerate = useMutation({
    mutationFn: () =>
      client.integrations.updateCredentials({ key: "google_forms", credentials: {} }),
    onSuccess: async (result) => {
      setRevealed(result.webhookSecret ?? null);
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  const importCsv = useMutation({
    mutationFn: () => client.integrations.importCsv({ csv }),
    onSuccess: (result) =>
      toast.success(`Imported ${result.successCount} rows, ${result.errorCount} errors`),
    onError: (error) => toast.error(error.message),
  });

  const importSheets = useMutation({
    mutationFn: () => client.integrations.importSheets(),
    onSuccess: (result) => toast.success(`Imported ${result.successCount} rows from Google Sheets`),
    onError: (error) => toast.error(error.message),
  });

  const sendTest = useMutation({
    mutationFn: () => client.integrations.sendTestEmail({ to: testEmail }),
    onSuccess: (result) => toast.success(`Email sent via ${result.mode} mode`),
    onError: (error) => toast.error(error.message),
  });

  async function confirmDisable(item: Integration) {
    const name = INTEGRATION_NAMES[item.key];
    if (
      await confirm({
        title: `Disable ${name}?`,
        description:
          "Disabling erases the saved credentials. Some providers only show a secret once; make sure you can generate a new one.",
        confirmLabel: "Disable and erase",
        destructive: true,
      })
    )
      disable.mutate(item.key);
  }

  async function confirmRegenerate() {
    if (
      await confirm({
        title: "Regenerate the Google Forms webhook secret?",
        description: "The Apps Script stops working until you paste the new secret.",
        confirmLabel: "Regenerate secret",
        destructive: true,
      })
    )
      regenerate.mutate();
  }

  const current = dialog ? list.data?.find((item) => item.key === dialog.key) : undefined;

  return (
    <PageShell>
      <PageHeader
        title="Integrations"
        description="Credentials are tested when they are saved and stored encrypted. Secrets are never shown again; only their last characters are."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {list.isPending ? <p role="status">Loading integrations...</p> : null}
        {list.isError ? (
          <ErrorAlert className="md:col-span-2">
            Unable to load integrations. Reload to try again.
          </ErrorAlert>
        ) : null}
        {list.data?.map((item) => {
          const name = INTEGRATION_NAMES[item.key];
          const warning = CREDENTIAL_WARNINGS[item.credentialStatus];
          return (
            <Card key={item.key}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <CardTitle>{name}</CardTitle>
                  <StatusBadge tone={item.enabled ? "active" : "disabled"}>
                    {item.enabled ? "Enabled" : "Disabled"}
                  </StatusBadge>
                </div>
                <CardDescription>{item.summary}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {item.fields.length ? (
                  <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
                    {item.fields.map((field) => (
                      <div key={field.name} className="contents">
                        <dt className="text-muted-foreground">{field.label}:</dt>
                        <dd className="break-all">
                          {field.secret ? secretLabel(field) : (field.value ?? "Not set")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {item.credentialsUpdatedAt ? (
                  <p className="text-xs text-muted-foreground">
                    Updated {new Date(item.credentialsUpdatedAt).toLocaleString()}
                    {item.credentialsUpdatedBy ? ` by ${item.credentialsUpdatedBy}` : ""}
                  </p>
                ) : null}
                {warning ? (
                  <p role="status" className="text-sm text-warning">
                    {warning}
                  </p>
                ) : null}
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    {item.enabled ? (
                      <>
                        {item.key === "google_forms" ? (
                          <PrimaryButton
                            variant="outline"
                            pending={regenerate.isPending}
                            pendingLabel="Regenerating"
                            onClick={() => void confirmRegenerate()}
                          >
                            Regenerate {name} secret
                          </PrimaryButton>
                        ) : (
                          <PrimaryButton
                            variant="outline"
                            onClick={() => setDialog({ key: item.key, mode: "update" })}
                          >
                            Update {name} credentials
                          </PrimaryButton>
                        )}
                        <PrimaryButton
                          variant="outline"
                          pending={disable.isPending && disable.variables === item.key}
                          pendingLabel="Disabling"
                          onClick={() => void confirmDisable(item)}
                        >
                          Disable {name}
                        </PrimaryButton>
                      </>
                    ) : (
                      <PrimaryButton
                        variant="outline"
                        onClick={() => setDialog({ key: item.key, mode: "enable" })}
                      >
                        Enable {name}
                      </PrimaryButton>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {dialog && current ? (
        <CredentialsDialog
          key={`${dialog.key}-${dialog.mode}`}
          item={current}
          mode={dialog.mode}
          onClose={() => setDialog(null)}
          onSecret={setRevealed}
        />
      ) : null}
      {revealed ? <SecretReveal secret={revealed} onClose={() => setRevealed(null)} /> : null}
      {canManage ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>CSV import</CardTitle>
              <CardDescription>
                Gender is required: Male or Female. Facebook links, when supplied, must be full
                Facebook profile URLs.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-4">
              <Textarea
                className="font-mono text-xs"
                rows={8}
                value={csv}
                onChange={(event) => setCsv(event.target.value)}
                aria-label="CSV import"
              />
              <PrimaryButton
                onClick={() => importCsv.mutate()}
                pending={importCsv.isPending}
                pendingLabel="Importing"
              >
                Import CSV
              </PrimaryButton>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Google Sheets import</CardTitle>
            </CardHeader>
            <CardContent>
              <PrimaryButton
                onClick={() => importSheets.mutate()}
                pending={importSheets.isPending}
                pendingLabel="Importing"
              >
                Import from Google Sheets
              </PrimaryButton>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Test email</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row">
              <FormField id="testEmail" label="Recipient">
                <Input
                  id="testEmail"
                  type="email"
                  placeholder="you@example.com"
                  value={testEmail}
                  onChange={(event) => setTestEmail(event.target.value)}
                />
              </FormField>
              <div className="flex items-end">
                <PrimaryButton
                  onClick={() => sendTest.mutate()}
                  pending={sendTest.isPending}
                  pendingLabel="Sending"
                >
                  Send test
                </PrimaryButton>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </PageShell>
  );
}

/** One form for enabling (all required values) and updating (blank secrets keep the saved value). */
function CredentialsDialog({
  item,
  mode,
  onClose,
  onSecret,
}: {
  item: Integration;
  mode: "enable" | "update";
  onClose: () => void;
  onSecret: (secret: string) => void;
}) {
  const name = INTEGRATION_NAMES[item.key];
  const fields = INTEGRATION_CREDENTIAL_FIELDS[item.key];
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((field) => {
        const saved = item.fields.find((entry) => entry.name === field.name);
        const initial =
          !field.secret && mode === "update" && saved?.value
            ? saved.value
            : field.kind === "choice"
              ? (field.options?.[0]?.value ?? "")
              : "";
        return [field.name, initial];
      }),
    ),
  );
  const savedSecret = (field: CredentialField) =>
    mode === "update" &&
    field.secret &&
    item.fields.find((entry) => entry.name === field.name)?.set;
  // Blank secrets that are already saved are kept by the server, so they count as provided.
  const problem =
    mode === "enable"
      ? credentialsError(item.key, values)
      : (fields
          .map((field) => {
            const value = values[field.name]?.trim() ?? "";
            if (!value)
              return fieldRequired(field, values) && !savedSecret(field)
                ? `${field.label} is required.`
                : null;
            return credentialFormatError(field, value);
          })
          .find(Boolean) ?? null);
  const visible = fields.filter(
    (field) => !field.requiredWhen || fieldRequired(field, values) || savedSecret(field),
  );
  const save = useMutation({
    mutationFn: () => {
      const credentials = Object.fromEntries(
        visible.map((field) => [field.name, values[field.name] ?? ""]),
      );
      return mode === "enable"
        ? client.integrations.enable({ key: item.key, credentials })
        : client.integrations.updateCredentials({ key: item.key, credentials });
    },
    onSuccess: async (result) => {
      toast.success(mode === "enable" ? `${name} enabled` : `${name} credentials updated`);
      await queryClient.invalidateQueries();
      onClose();
      if (result.webhookSecret) onSecret(result.webhookSecret);
    },
  });
  const forms = item.key === "google_forms";
  const title = mode === "enable" ? `Enable ${name}` : `Update ${name} credentials`;
  const submitLabel = forms
    ? "Generate secret and enable"
    : mode === "enable"
      ? "Test and enable"
      : "Test and save";
  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      pending={save.isPending}
      title={title}
      description={
        forms
          ? "A webhook secret will be generated. It is shown once."
          : "Every required value is checked with the provider before it is saved."
      }
      footer={
        <PrimaryButton
          type="submit"
          form="integration-credentials"
          pending={save.isPending}
          pendingLabel={forms ? "Generating" : "Testing"}
          disabled={Boolean(problem)}
        >
          {submitLabel}
        </PrimaryButton>
      }
    >
      <form
        id="integration-credentials"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!problem) save.mutate();
        }}
      >
        {save.isError ? <ErrorAlert>{save.error.message}</ErrorAlert> : null}
        {visible.map((field) => {
          const id = `credential-${field.name}`;
          const hintId = field.hint ? `${id}-hint` : undefined;
          const saved = item.fields.find((entry) => entry.name === field.name);
          const keep =
            savedSecret(field) && saved?.hint && saved.hint.length === 4 && saved.hint !== "json"
              ? `Leave blank to keep ••••${saved.hint}`
              : savedSecret(field)
                ? "Leave blank to keep the saved value"
                : undefined;
          const set = (value: string) => setValues((prev) => ({ ...prev, [field.name]: value }));
          return (
            <FormField
              key={field.name}
              id={id}
              label={field.label}
              required={fieldRequired(field, values) && !savedSecret(field)}
            >
              {field.kind === "choice" ? (
                <FormSelect
                  id={id}
                  value={values[field.name] ?? ""}
                  onValueChange={set}
                  items={(field.options ?? []).map((option) => ({ ...option }))}
                  aria-describedby={hintId}
                />
              ) : field.kind === "json" ? (
                <Textarea
                  id={id}
                  className="font-mono text-xs"
                  rows={6}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={keep}
                  value={values[field.name] ?? ""}
                  onChange={(event) => set(event.target.value)}
                  aria-describedby={hintId}
                />
              ) : (
                <Input
                  id={id}
                  type={
                    field.secret
                      ? "password"
                      : field.kind === "email"
                        ? "email"
                        : field.kind === "url"
                          ? "url"
                          : "text"
                  }
                  autoComplete="off"
                  placeholder={keep}
                  value={values[field.name] ?? ""}
                  onChange={(event) => set(event.target.value)}
                  aria-describedby={hintId}
                />
              )}
              {field.hint ? (
                <p id={hintId} className="text-xs text-muted-foreground">
                  {field.hint}
                </p>
              ) : null}
            </FormField>
          );
        })}
        {problem && !forms ? (
          <p role="status" className="text-sm text-muted-foreground">
            {problem}
          </p>
        ) : null}
      </form>
    </FormDialog>
  );
}

function SecretReveal({ secret, onClose }: { secret: string; onClose: () => void }) {
  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Google Forms webhook secret"
      description="Copy it now. It will not be shown again."
      footer={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}
    >
      <div className="flex flex-col gap-3 text-sm">
        <code className="block rounded-lg border bg-muted px-3 py-2 font-mono text-xs break-all">
          {secret}
        </code>
        <PrimaryButton
          variant="outline"
          className="self-start"
          onClick={() =>
            void navigator.clipboard
              .writeText(secret)
              .then(() => toast.success("Secret copied"))
              .catch(() => toast.error("Copy failed. Select the secret and copy it manually."))
          }
        >
          Copy secret
        </PrimaryButton>
        <p className="text-muted-foreground">
          Paste it into the Apps Script as <span className="font-mono">WEBHOOK_SECRET</span>.
          Regenerating replaces it, and the script stops working until it has the new value. See
          docs/operations/FORMS_WEBHOOK.md for the full setup.
        </p>
      </div>
    </FormDialog>
  );
}
