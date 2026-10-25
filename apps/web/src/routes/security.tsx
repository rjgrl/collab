import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@Alumni-Tracking-Ss/ui/components/card";
import { FormField, PrimaryButton } from "@/components/page-header";
import { client, api, queryClient } from "@/utils/api";

export const Route = createFileRoute("/security")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.fetchQuery(context.api.auth.me.queryOptions());
    if (!user) throw redirect({ to: "/login" });
    if (user.needsProfileCompletion) throw redirect({ to: "/complete-profile" });
  },
  component: SecurityPage,
});
function SecurityPage() {
  const status = useQuery(api.auth.mfaStatus.queryOptions());
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<void>) {
    setPending(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to continue.");
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-8 sm:py-12">
      <Card className="w-full max-w-lg">
        <CardHeader className="gap-2">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <GraduationCap className="size-5 shrink-0 text-primary" aria-hidden="true" />
            Alumni Tracking System
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Authenticator security</h1>
          <CardDescription>
            Manage your authenticator. Keep recovery codes somewhere private, outside this browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error || status.isError ? (
            <p
              className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
              role="alert"
            >
              {error || status.error?.message}
            </p>
          ) : null}
          {status.data?.enforcementDisabled ? (
            <p className="rounded-lg border bg-muted/50 px-3 py-3 text-sm" role="status">
              Authenticator requirements are paused for local testing.{" "}
              <Link
                className="font-medium text-primary underline-offset-4 hover:underline"
                to="/dashboard"
              >
                Continue to application
              </Link>
            </p>
          ) : null}
          {status.isPending ? (
            <p className="text-sm text-muted-foreground" role="status">
              Loading security settings…
            </p>
          ) : !status.data?.configured ? (
            <p
              className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-3 text-sm text-destructive"
              role="alert"
            >
              Authenticator security is unavailable. Ask the local administrator to run setup:local
              and restart the server, or configure the encryption key.
            </p>
          ) : recoveryCodes.length ? (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed" role="status">
                Authenticator enabled. These recovery codes are shown once. Each code can be used
                once after signing in with your password.
              </p>
              <ul className="grid gap-x-4 gap-y-2 rounded-lg border bg-muted/50 p-4 font-mono text-sm sm:grid-cols-2">
                {recoveryCodes.map((item) => (
                  <li className="break-all" key={item}>
                    {item}
                  </li>
                ))}
              </ul>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={saved}
                  onChange={(event) => setSaved(event.target.checked)}
                />
                I saved my recovery codes privately
              </label>
              <PrimaryButton
                className="w-full"
                disabled={!saved}
                onClick={() =>
                  void run(async () => {
                    setRecoveryCodes([]);
                    await queryClient.invalidateQueries();
                    await navigate({ to: "/dashboard" });
                  })
                }
              >
                Continue to application
              </PrimaryButton>
            </div>
          ) : setup ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const result = await client.auth.confirmMfa({ code });
                  setRecoveryCodes(result.recoveryCodes);
                  setSetup(null);
                  setCode("");
                  await queryClient.invalidateQueries();
                });
              }}
            >
              <p className="text-sm leading-relaxed">
                In your authenticator app, add an account using this setup key. Choose time-based
                codes, six digits, changing every 30 seconds. Setup expires in 10 minutes.
              </p>
              <p
                className="break-all rounded-lg border bg-muted/50 p-4 font-mono text-sm"
                aria-label="Authenticator setup key"
              >
                {setup.secret}
              </p>
              <a
                className="block text-sm font-medium text-primary underline-offset-4 hover:underline"
                href={setup.uri}
              >
                Open in an authenticator app on this device
              </a>
              <FormField id="mfa-code" label="Authenticator code" required>
                <Input
                  id="mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  pattern="[0-9]{6}"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </FormField>
              <PrimaryButton className="w-full" type="submit" pending={pending}>
                Confirm authenticator
              </PrimaryButton>
            </form>
          ) : status.data?.enrolled && (!status.data.verified || !status.data.fresh) ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await client.auth.verifyMfa({ code: code.trim() });
                  setCode("");
                  await queryClient.invalidateQueries();
                  await navigate({ to: "/dashboard" });
                });
              }}
            >
              <FormField id="mfa-code" label="Authenticator or recovery code" required>
                <Input
                  id="mfa-code"
                  autoComplete="one-time-code"
                  required
                  maxLength={32}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </FormField>
              <p className="text-sm text-muted-foreground">
                Use a six-digit authenticator code or one of your saved recovery codes. If both are
                lost, contact your administrator for the documented offline recovery procedure.
              </p>
              <PrimaryButton className="w-full" type="submit" pending={pending}>
                Verify authenticator
              </PrimaryButton>
            </form>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  setSetup(await client.auth.beginMfa({ password }));
                  setPassword("");
                });
              }}
            >
              {status.data?.verified ? (
                <p className="rounded-lg border bg-muted/50 px-3 py-3 text-sm" role="status">
                  Your authenticator is verified for this session. Replacing it will revoke other
                  sessions and issue new recovery codes.
                </p>
              ) : null}
              <FormField id="mfa-password" label="Current password" required>
                <Input
                  id="mfa-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </FormField>
              <PrimaryButton className="w-full" type="submit" pending={pending}>
                {status.data?.enrolled ? "Replace authenticator" : "Set up authenticator"}
              </PrimaryButton>
              {status.data?.verified || !status.data?.required ? (
                <Link
                  className="block text-sm font-medium text-primary underline-offset-4 hover:underline"
                  to="/dashboard"
                >
                  Back to application
                </Link>
              ) : null}
            </form>
          )}
          <Button
            className="w-full"
            variant="outline"
            onClick={() =>
              void run(async () => {
                await client.auth.logout();
                queryClient.clear();
                await navigate({ to: "/login" });
              })
            }
          >
            Sign out
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
