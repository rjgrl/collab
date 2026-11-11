import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { FormField, PrimaryButton } from "@/components/forms/form-layout";
import { AuthHeader, AuthLayout } from "@/components/layout/auth-layout";
import { PasswordChecklist } from "@/components/forms/password-checklist";
import {
  isPasswordScreeningMessage,
  passwordMeetsPolicy,
} from "@Alumni-Tracking-Ss/contracts/password-policy";
import { client, queryClient } from "@/lib/api";

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
  const [screeningError, setScreeningError] = useState<string | null>(null);
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
    <AuthLayout>
      <AuthHeader
        title={token ? "Choose a new password" : "Reset your password"}
        description="Reset links expire in 15 minutes and work once. Resetting a password signs out all sessions and keeps your authenticator enabled."
      />
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setPending(true);
          setError("");
          setScreeningError(null);
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
              const failure = err instanceof Error ? err.message : "Unable to continue.";
              if (isPasswordScreeningMessage(failure)) setScreeningError(failure);
              else setError(failure);
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
                onChange={(event) => {
                  setPassword(event.target.value);
                  setScreeningError(null);
                }}
              />
            </FormField>
            <PasswordChecklist id="reset-guidance" value={password} serverError={screeningError} />
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
            <PrimaryButton
              type="submit"
              pending={pending}
              disabled={!passwordMeetsPolicy(password) || password !== confirmation}
            >
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
        {error ? <ErrorAlert>{error}</ErrorAlert> : null}
        <Link
          className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
          to="/login"
        >
          Back to sign in
        </Link>
      </form>
    </AuthLayout>
  );
}
