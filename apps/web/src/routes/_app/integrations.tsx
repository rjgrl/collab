import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@Alumni-Tracking-Ss/ui/components/card";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { Textarea } from "@Alumni-Tracking-Ss/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader, PrimaryButton } from "@/components/page-header";
import { can, useSession } from "@/lib/session";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_app/integrations")({
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const session = useSession();
  const list = useQuery(orpc.integrations.list.queryOptions());
  const canWrite = can(session.data?.permissions, "integrations.write");
  const [csv, setCsv] = useState(
    "studentNumber,firstName,lastName,departmentCode,programCode,personalEmail,isTracked\n",
  );
  const [testEmail, setTestEmail] = useState("");

  const toggle = useMutation({
    mutationFn: (input: { key: string; enabled: boolean }) => client.integrations.toggle(input),
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
    onSuccess: (result) =>
      toast.success(`Imported ${result.successCount} rows from Sheets`),
    onError: (error) => toast.error(error.message),
  });

  const sendTest = useMutation({
    mutationFn: () => client.integrations.sendTestEmail({ to: testEmail }),
    onSuccess: (result) => toast.success(`Email sent via ${result.mode} mode`),
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Modular integrations"
        description="Each integration can be enabled or disabled without rewriting core modules. Unconfigured services use a documented fallback."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {list.data?.map((item) => (
          <Card key={item.key}>
            <CardHeader>
              <CardTitle className="capitalize">{item.key.replaceAll("_", " ")}</CardTitle>
              <CardDescription>
                {item.mode} · {item.summary}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {canWrite ? (
                <PrimaryButton
                  variant="outline"
                  onClick={() => toggle.mutate({ key: item.key, enabled: !item.enabled })}
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
              <CardDescription>Fallback for Google Sheets when credentials are not configured.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Textarea rows={8} value={csv} onChange={(event) => setCsv(event.target.value)} />
              <PrimaryButton onClick={() => importCsv.mutate()} pending={importCsv.isPending}>
                Import CSV
              </PrimaryButton>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Google Sheets import</CardTitle>
            </CardHeader>
            <CardContent>
              <PrimaryButton onClick={() => importSheets.mutate()} pending={importSheets.isPending}>
                Import from Sheets
              </PrimaryButton>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Test email</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Input
                type="email"
                placeholder="you@example.com"
                value={testEmail}
                onChange={(event) => setTestEmail(event.target.value)}
              />
              <PrimaryButton onClick={() => sendTest.mutate()} pending={sendTest.isPending}>
                Send
              </PrimaryButton>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
