import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@Alumni-Tracking-Ss/ui/components/card";
import { FormField, PrimaryButton } from "@/components/page-header";
import { PasswordGuidance } from "@/components/password-guidance";
import { client, queryClient } from "@/utils/api";

export const Route = createFileRoute("/reset-password")({ component: ResetPassword });
function ResetPassword() {
  const [token, setToken] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const readToken = () => {
      const incoming = new URLSearchParams(window.location.hash.slice(1)).get("token");
      if (incoming) {
        setToken(incoming);
        setMessage("");
        setError("");
        window.history.replaceState(window.history.state, "", window.location.pathname);
      }
    };
    readToken();
    window.addEventListener("hashchange", readToken);
    return () => window.removeEventListener("hashchange", readToken);
  }, []);
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-8 sm:py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-2">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <GraduationCap className="size-5 shrink-0 text-primary" aria-hidden="true" />
            Alumni Tracking System
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {token ? "Choose a new password" : "Reset your password"}
          </h1>
          <CardDescription>
            Reset links expire in 15 minutes and work once. Resetting a password signs out all
            sessions and keeps your authenticator enabled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setPending(true);
              setError("");
              void (async () => {
                try {
                  if (token) {
                    if (password !== confirmation) throw new Error("Passwords must match.");
                    await client.auth.resetPassword({ token, password });
                    queryClient.clear();
                    setPassword("");
                    setConfirmation("");
                    setMessage("Password reset. Sign in with your new password and authenticator.");
                  } else {
                    const result = await client.auth.forgotPassword({ email });
                    setMessage(result.message);
                  }
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Unable to continue.");
                } finally {
                  setPending(false);
                }
              })();
            }}
          >
            {message ? (
              <p className="rounded-lg border bg-muted/50 px-3 py-3 text-sm" role="status">
                {message}
              </p>
            ) : token ? (
              <>
                <FormField id="reset-password" label="New password" required>
                  <Input
                    id="reset-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={15}
                    maxLength={256}
                    required
                    value={password}
                    aria-describedby="reset-guidance"
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </FormField>
                <PasswordGuidance id="reset-guidance" value={password} />
                <FormField id="reset-confirmation" label="Confirm password" required>
                  <Input
                    id="reset-confirmation"
                    type="password"
                    autoComplete="new-password"
                    required
                    maxLength={256}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </FormField>
                <PrimaryButton type="submit" pending={pending} disabled={password !== confirmation}>
                  Save new password
                </PrimaryButton>
              </>
            ) : (
              <>
                <FormField id="reset-email" label="Email" required>
                  <Input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </FormField>
                <PrimaryButton type="submit" pending={pending}>
                  Send reset link
                </PrimaryButton>
              </>
            )}
            {error ? (
              <p
                className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <Link
              className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
              to="/login"
            >
              Back to sign in
            </Link>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
