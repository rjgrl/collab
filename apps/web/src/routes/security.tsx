import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { FormCard, FormField, PageShell, PrimaryButton } from "@/components/page-header";
import { client, orpc, queryClient } from "@/utils/orpc";
import { postJson } from "@/lib/session";

export const Route = createFileRoute("/security")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.fetchQuery(context.orpc.auth.me.queryOptions());
    if (!user) throw redirect({ to: "/login" });
    if (user.needsProfileCompletion) throw redirect({ to: "/complete-profile" });
  },
  component: SecurityPage,
});
function SecurityPage() {
  const status = useQuery(orpc.auth.mfaStatus.queryOptions());
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
    <PageShell>
      <div className="mx-auto w-full max-w-lg py-8">
        <FormCard
          title="Authenticator security"
          description={
            status.data?.enforcementDisabled
              ? "MFA is temporarily disabled for all accounts, including administrators, in local development."
              : "Administrative access requires a second factor. Keep recovery codes somewhere private, outside this browser."
          }
        >
          {error || status.isError ? <p role="alert">{error || status.error?.message}</p> : null}
          {status.data?.enforcementDisabled ? (
            <p role="status">
              Authenticator checks are paused for local testing. Existing enrollment is preserved.{" "}
              <Link to="/dashboard" className="underline">
                Continue to application
              </Link>
            </p>
          ) : null}
          {status.isPending ? (
            <p role="status">Loading security settings…</p>
          ) : status.data?.enforcementDisabled ? null : !status.data?.configured ? (
            <p role="alert">
              Authenticator security is unavailable. Ask the local administrator to run setup:local
              and restart the server, or configure the encryption key.
            </p>
          ) : recoveryCodes.length ? (
            <div className="space-y-4">
              <p role="status">
                Authenticator enabled. These recovery codes are shown once. Each code can be used
                once after signing in with your password.
              </p>
              <ul className="space-y-1 font-mono text-xs">
                {recoveryCodes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={saved}
                  onChange={(event) => setSaved(event.target.checked)}
                />
                I saved my recovery codes privately
              </label>
              <PrimaryButton
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
              <p>
                In your authenticator app, add an account using this setup key. Choose time-based
                codes, six digits, changing every 30 seconds. Setup expires in 10 minutes.
              </p>
              <p className="break-all font-mono" aria-label="Authenticator setup key">
                {setup.secret}
              </p>
              <a className="underline" href={setup.uri}>
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
              <PrimaryButton type="submit" pending={pending}>
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
              <PrimaryButton type="submit" pending={pending}>
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
                <p role="status">
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
              <PrimaryButton type="submit" pending={pending}>
                {status.data?.enrolled ? "Replace authenticator" : "Set up authenticator"}
              </PrimaryButton>
              {status.data?.verified || !status.data?.required ? (
                <Link className="block underline" to="/dashboard">
                  Back to application
                </Link>
              ) : null}
            </form>
          )}
          <Button
            className="mt-4"
            variant="outline"
            onClick={() =>
              void run(async () => {
                await postJson("/api/auth/logout", {});
                queryClient.clear();
                await navigate({ to: "/login" });
              })
            }
          >
            Sign out
          </Button>
        </FormCard>
      </div>
    </PageShell>
  );
}
