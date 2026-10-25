import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@Alumni-Tracking-Ss/ui/components/card";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { Textarea } from "@Alumni-Tracking-Ss/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, PageHeader, PageShell, PrimaryButton } from "@/components/page-header";
import { can, useSession } from "@/lib/session";
import { client, api, queryClient } from "@/utils/api";
import { StatusBadge } from "@/components/status-badge";

const INTEGRATION_NAMES: Record<string, string> = {
  recaptcha: "reCAPTCHA",
  google_auth: "Google Auth",
  google_drive: "Google Drive",
  email: "Email",
  image_host: "Image host",
  google_forms: "Google Forms",
  google_sheets: "Google Sheets",
};

export function IntegrationsPage() {
  const session = useSession();
  const list = useQuery(api.integrations.list.queryOptions());
  const canWrite = can(session.data?.permissions, "integrations.write");
  const [csv, setCsv] = useState(
    "studentNumber,firstName,lastName,gender,departmentName,programCode,personalEmail,isTracked\n",
  );
  const [testEmail, setTestEmail] = useState("");

  const toggle = useMutation({
    mutationFn: (input: Parameters<typeof client.integrations.toggle>[0]) =>
      client.integrations.toggle(input),
    onSuccess: async () => {
      toast.success("Integration updated");
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

  return (
    <PageShell>
      <PageHeader
        title="Integrations"
        description="Manage enabled services. Configuration status indicates available settings; it does not verify a provider connection."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {list.isPending ? <p role="status">Loading integrations...</p> : null}
        {list.isError ? (
          <p role="alert" className="rounded-lg border p-4 text-sm md:col-span-2">
            Unable to load integrations. Reload to try again.
          </p>
        ) : null}
        {list.data?.map((item) => (
          <Card key={item.key}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <CardTitle>
                  {INTEGRATION_NAMES[item.key] ?? item.key.replaceAll("_", " ")}
                </CardTitle>
                <StatusBadge tone={item.enabled ? "active" : "disabled"}>
                  {item.enabled ? "Enabled" : "Disabled"}
                </StatusBadge>
              </div>
              <CardDescription>{item.summary}</CardDescription>
            </CardHeader>
            <CardContent>
              {canWrite ? (
                <PrimaryButton
                  variant="outline"
                  aria-label={`${item.enabled ? "Disable" : "Enable"} ${INTEGRATION_NAMES[item.key] ?? item.key}`}
                  onClick={() => toggle.mutate({ key: item.key, enabled: !item.enabled })}
                  pending={toggle.isPending && toggle.variables?.key === item.key}
                  pendingLabel={item.enabled ? "Disabling" : "Enabling"}
                >
                  {item.enabled ? "Disable" : "Enable"}
                </PrimaryButton>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
      {canWrite ? (
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
